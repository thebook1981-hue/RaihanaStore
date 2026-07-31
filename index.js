// مسار تأكيد الطلب المباشر وتوجيه الإشعار لمدير المتجر الخاص به فقط
app.post('/api/confirm-order', async (req, res) => {
    const { orderId } = req.body;
    
    if (!orderId) {
        return res.status(400).json({ success: false, message: 'رقم الطلب غير متوفر' });
    }

    try {
        // 1. جلب تفاصيل الطلب لمعرفة رقم المتجر
        const { data: order, error: orderErr } = await supabase
            .from('platform_orders')
            .update({ status: 'قيد التجهيز' })
            .eq('id', orderId)
            .select()
            .single();

        if (orderErr || !order) {
            return res.status(404).json({ success: false, message: 'لم يتم العثور على الطلب في النظام' });
        }

        // 2. جلب الـ Chat ID الخاص بمدير المتجر
        const { data: store, error: storeErr } = await supabase
            .from('stores')
            .select('name, telegram_chat_id')
            .eq('id', order.store_id)
            .single();

        if (store && store.telegram_chat_id) {
            // 3. إرسال الإشعار لمدير المتجر عبر تليجرام
            const storeAdminChatId = store.telegram_chat_id;
            const adminMsg = `🚨 طلب جديد في متجر (${store.name})!\n\n` +
                             `🧾 رقم الفاتورة: #9000${order.id}\n` +
                             `👤 رقم الزبون: ${order.customer_phone || 'غير متوفر'}\n` +
                             `💰 المبلغ: ${order.grand_total} د.ع\n` +
                             `📦 الحالة: قيد التجهيز 🌿`;
            
            await bot.telegram.sendMessage(storeAdminChatId, adminMsg);
        } else {
            console.warn(`المتجر ${order.store_id} ليس لديه telegram_chat_id`);
        }

        res.json({ success: true, order });

    } catch (err) {
        console.error('خطأ:', err);
        res.status(500).json({ success: false, message: 'خطأ في الخادم' });
    }
});

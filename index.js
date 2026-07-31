const express = require('express');
const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const token = process.env.TELEGRAM_TOKEN;
const bot = new Telegraf(token);

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// مسار جديد: تأكيد الطلب مباشرة من واجهة المتجر وعرض الفاتورة للزبون + إرسال تنبيه للمدير
app.post('/api/confirm-order', async (req, res) => {
    const { orderId } = req.body;
    
    if (!orderId) {
        return res.status(400).json({ success: false, message: 'رقم الطلب غير متوفر' });
    }

    try {
        // 1. تحديث حالة الطلب في Supabase إلى قيد التجهيز
        const { data: order, error } = await supabase
            .from('platform_orders')
            .update({ status: 'قيد التجهيز' })
            .eq('id', orderId)
            .select()
            .single();

        if (error || !order) {
            return res.status(404).json({ success: false, message: 'لم يتم العثور على الطلب في النظام' });
        }

        // 2. إرسال إشعار فوري لك أنت (مدير المتجر) على حسابك في تليجرام
        const adminChatId = process.env.ADMIN_CHAT_ID; // معرف محادثتك الشخصية على تليجرام
        if (adminChatId) {
            const adminMsg = `🚨 طلب جديد في متجر ريحانة!\n\n` +
                             `🧾 رقم الفاتورة: #9000${order.id}\n` +
                             `👤 اسم الزبون: ${order.customer_name || 'غير متوفر'}\n` +
                             `📞 الهاتف: ${order.customer_phone || 'غير متوفر'}\n` +
                             `📦 الحالة: قيد التجهيز 🌿`;
            
            await bot.telegram.sendMessage(adminChatId, adminMsg);
        }

        // 3. إعادة الرد بنجاح للزبون لكي تظهر له الفاتورة على الشاشة
        res.json({ success: true, order });

    } catch (err) {
        console.error('خطأ في التأكيد المباشر:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ داخلي في الخادم' });
    }
});

// المسارات الأخرى الافتراضية
app.get('/', (req, res) => {
    res.send('Raihana Store Direct API is running! 🚀');
});

module.exports = app;

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { Telegraf, Markup } = require('telegraf');

const app = express();
app.use(cors());
app.use(express.json());

// الاتصال بقاعدة البيانات وتجهيز البوت باستخدام متغيرات البيئة من Vercel
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// ==========================================
// 🌟 1. برمجة أوامر بوت التليجرام (لخدمة توثيق الزبائن) 🌟
// ==========================================

// عند دخول الزبون للبوت من الموقع (مثال: /start req_12345)
bot.start(async (ctx) => {
    const payload = ctx.payload; // يسحب الكود بعد كلمة start
    
    if (payload && payload.startsWith('req_')) {
        // تحديث قاعدة البيانات لربط هذا الكود بـ chat_id الخاص بهذا الزبون
        await supabase
            .from('telegram_auth')
            .update({ chat_id: ctx.from.id })
            .eq('auth_code', payload);

        await ctx.reply(
            'مرحباً بك في خدمة التوثيق الآلي لمتجر ريحانة 🌿\n\nيرجى الضغط على الزر أدناه لمشاركة رقم هاتفك وتأكيد حسابك:',
            Markup.keyboard([
                Markup.button.contactRequest('📱 مشاركة رقمي لتوثيق الحساب')
            ]).oneTime().resize()
        );
    } else {
        await ctx.reply('مرحباً بك! هذا البوت مخصص لتوثيق الحسابات من موقع متجر ريحانة.');
    }
});

// عند قيام الزبون بمشاركة جهة الاتصال
bot.on('contact', async (ctx) => {
    const contact = ctx.message.contact;
    const chatId = ctx.from.id;

    // 🛡️ فحص أمني: هل الرقم يعود لنفس الشخص؟
    if (contact.user_id !== chatId) {
        return ctx.reply('⚠️ عذراً، يجب عليك مشاركة رقمك الشخصي حصراً من خلال الزر المخصص أسفل الشاشة.');
    }

    // تنسيق الرقم ليصبح محلياً (077...)
    let phone = contact.phone_number;
    if (phone.startsWith('+964')) phone = '0' + phone.substring(4);
    else if (phone.startsWith('964')) phone = '0' + phone.substring(3);

    try {
        // 1. البحث عن الكود الذي يخص هذا الزبون وحالته "قيد الانتظار"
        const { data, error: fetchErr } = await supabase
            .from('telegram_auth')
            .select('auth_code')
            .eq('chat_id', chatId)
            .eq('status', 'pending')
            .single();

        if (fetchErr || !data) {
            return ctx.reply('⚠️ لم يتم العثور على طلب توثيق قيد الانتظار. يرجى العودة للموقع وتحديث الصفحة والمحاولة من جديد.');
        }

        // 2. تحديث السجل بالرقم الحقيقي وتغيير الحالة إلى "verified"
        const { error: updateErr } = await supabase
            .from('telegram_auth')
            .update({ phone_number: phone, status: 'verified' })
            .eq('auth_code', data.auth_code);

        if (updateErr) throw updateErr;

        await ctx.reply('✅ تم توثيق رقمك بنجاح!\n\nيمكنك الآن العودة إلى صفحة المتجر، سيتم إكمال طلبك تلقائياً.', Markup.removeKeyboard());

    } catch (error) {
        console.error("خطأ في التوثيق:", error);
        ctx.reply('❌ حدث خطأ في النظام، يرجى إبلاغ الإدارة أو المحاولة لاحقاً.');
    }
});

// ==========================================
// 🌟 2. مسارات تطبيق Express (Vercel) 🌟
// ==========================================

// مسار الفحص
app.get('/', (req, res) => res.send('✅ سيرفر ريحانة يعمل بنجاح!'));

// مسار ربط البوت بـ Vercel (يُستخدم لمرة واحدة فقط لتفعيل الـ Webhook)
app.get('/api/setup-webhook', async (req, res) => {
    try {
        // ⚠️ لا تنسَ: استبدل هذا الرابط برابط مشروع Vercel الحقيقي الخاص بك!
        const webhookUrl = 'https://raihana-store.vercel.app/api/bot-webhook'; 
        await bot.telegram.setWebhook(webhookUrl);
        res.send(`✅ تم ربط البوت بنجاح بالرابط: ${webhookUrl}`);
    } catch (e) {
        res.status(500).send('❌ خطأ في الربط: ' + e.message);
    }
});

// المسار المخفي الذي سيستقبل رسائل تليجرام (Webhook)
app.use(bot.webhookCallback('/api/bot-webhook'));

// ==========================================
// 🌟 3. مسار تأكيد الطلب وإرسال الفواتير للمدير 🌟
// ==========================================
app.post('/api/confirm-order', async (req, res) => {
    const { orderId } = req.body;
    
    if (!orderId) {
        return res.status(400).json({ success: false, message: 'رقم الطلب غير متوفر' });
    }

    try {
        // 1. تحديث حالة الطلب وجلب كل تفاصيله (بما فيها العنوان)
        const { data: order, error: orderErr } = await supabase
            .from('platform_orders')
            .update({ status: 'قيد التجهيز' })
            .eq('id', orderId)
            .select('*')
            .single();

        if (orderErr || !order) {
            return res.status(404).json({ success: false, message: 'لم يتم العثور على الطلب في النظام أو تعذر تحديثه' });
        }

        // 2. 🛒 جلب تفاصيل المنتجات المرتبطة بهذا الطلب
        const { data: items, error: itemsErr } = await supabase
            .from('order_details')
            .select('item_name, quantity, price')
            .eq('order_id', orderId);

        // ترتيب المنتجات في قائمة نصية أنيقة
        let itemsText = '';
        if (items && items.length > 0) {
            itemsText = items.map(i => `▪️ ${i.item_name} (×${i.quantity}) - ${i.price * i.quantity} د.ع`).join('\n');
        } else {
            itemsText = 'لم يتم العثور على تفاصيل المنتجات';
        }

        // 3. جلب بيانات المتجر وصاحبه
        const { data: store, error: storeErr } = await supabase
            .from('stores')
            .select('name, telegram_chat_id')
            .eq('id', order.store_id)
            .single();

        if (store && store.telegram_chat_id) {
            // 4. إرسال الإشعار لمدير المتجر على تليجرام
            const storeAdminChatId = store.telegram_chat_id;
            
            const adminMsg = `🚨 طلب جديد من متجر (${store.name})!\n\n` +
                             `🧾 رقم الفاتورة: #9000${order.id}\n` +
                             `👤 هاتف الزبون: ${order.customer_phone || 'غير متوفر'}\n` +
                             `📍 منطقة الزبون: ${order.address || 'توصيل مباشر'}\n` +
                             `📝 ملاحظات الزبون: ${order.customer_notes || 'لا يوجد'}\n\n` +
                             `🛒 *المنتجات المطلوبة:*\n${itemsText}\n\n` +
                             `🚚 أجور التوصيل: ${order.total_delivery_fee || 0} د.ع\n` +
                             `💰 الإجمالي الكلي: ${order.grand_total} د.ع\n\n` +
                             `📦 الحالة: قيد التجهيز 🌿\n` +
                             `يرجى تجهيز الطلب وتسليمه للكابتن.`;
            
            try {
                await bot.telegram.sendMessage(storeAdminChatId, adminMsg, { parse_mode: 'Markdown' });
            } catch (tgErr) {
                console.error(`⚠️ فشل إرسال رسالة تليجرام للمتجر:`, tgErr.message);
            }
        } else {
            console.warn(`⚠️ المتجر ليس لديه telegram_chat_id مسجل لتلقي الإشعارات.`);
        }

        // 5. الرد بنجاح للواجهة الأمامية
        res.json({ success: true, order });

    } catch (err) {
        console.error('❌ خطأ داخلي في التأكيد المباشر:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ داخلي في الخادم' });
    }
});

// تصدير التطبيق ليعمل على بيئة Vercel
module.exports = app;

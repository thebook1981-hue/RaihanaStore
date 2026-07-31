const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { Telegraf } = require('telegraf');

// تهيئة تطبيق Express
const app = express();
app.use(cors()); // السماح بالاتصال من واجهة الموقع
app.use(express.json()); // لتمكين قراءة البيانات المرسلة بصيغة JSON

// استدعاء متغيرات البيئة من Vercel
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const telegramToken = process.env.TELEGRAM_TOKEN;

// التأكد من وجود المتغيرات الأساسية
if (!supabaseUrl || !supabaseKey || !telegramToken) {
    console.error("⚠️ تحذير: بعض متغيرات البيئة مفقودة (Supabase أو Telegram Token)");
}

// تهيئة الاتصال بقاعدة البيانات وبوت تليجرام
const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new Telegraf(telegramToken);

// مسار فحص حالة السيرفر (للتأكد أنه يعمل)
app.get('/', (req, res) => {
    res.send('✅ سيرفر منصة المتاجر يعمل بنجاح!');
});

// 🌟 المسار الرئيسي: تأكيد الطلب المباشر وتوجيه الإشعار لمدير المتجر الخاص به فقط 🌟
app.post('/api/confirm-order', async (req, res) => {
    const { orderId } = req.body;
    
    if (!orderId) {
        return res.status(400).json({ success: false, message: 'رقم الطلب غير متوفر' });
    }

    try {
        // 1. تحديث حالة الطلب من "بانتظار التأكيد" إلى "قيد التجهيز" وجلب تفاصيله
        const { data: order, error: orderErr } = await supabase
            .from('platform_orders')
            .update({ status: 'قيد التجهيز' })
            .eq('id', orderId)
            .select()
            .single();

        if (orderErr || !order) {
            return res.status(404).json({ success: false, message: 'لم يتم العثور على الطلب في النظام أو تعذر تحديثه' });
        }

        // 2. جلب بيانات المتجر وصاحبه من جدول stores باستخدام store_id الخاص بالطلب
        const { data: store, error: storeErr } = await supabase
            .from('stores')
            .select('name, telegram_chat_id')
            .eq('id', order.store_id)
            .single();

        if (store && store.telegram_chat_id) {
            // 3. إرسال الإشعار حصراً إلى مدير هذا المتجر على تليجرام
            const storeAdminChatId = store.telegram_chat_id;
            const adminMsg = `🚨 طلب جديد من متجر (${store.name})!\n\n` +
                             `🧾 رقم الفاتورة: #9000${order.id}\n` +
                             `👤 هاتف الزبون: ${order.customer_phone || 'غير متوفر'}\n` +
                             `💰 المبلغ الإجمالي: ${order.grand_total} د.ع\n` +
                             `📦 الحالة: قيد التجهيز 🌿\n\n` +
                             `يرجى تجهيز الطلب وتسليمه للكابتن.`;
            
            // محاولة إرسال الرسالة، وتجنب توقف السيرفر إذا كان الـ Chat ID خاطئاً
            try {
                await bot.telegram.sendMessage(storeAdminChatId, adminMsg);
            } catch (tgErr) {
                console.error(`⚠️ فشل إرسال رسالة تليجرام للمتجر ${store.name} (تأكد من الـ Chat ID وأن المدير ضغط Start):`, tgErr.message);
            }
        } else {
            console.warn(`⚠️ المتجر رقم ${order.store_id} ليس لديه telegram_chat_id مسجل لتلقي الإشعارات.`);
        }

        // 4. الرد بنجاح للواجهة الأمامية
        res.json({ success: true, order });

    } catch (err) {
        console.error('❌ خطأ داخلي في التأكيد المباشر:', err);
        res.status(500).json({ success: false, message: 'حدث خطأ داخلي في الخادم' });
    }
});

// تصدير التطبيق ليعمل على بيئة Vercel
module.exports = app;

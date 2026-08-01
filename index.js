const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { Telegraf, Markup } = require('telegraf');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// ==========================================
// 🌟 1. برمجة أوامر بوت التليجرام 🌟
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

// مسار ربط البوت بـ Vercel (يُستخدم لمرة واحدة فقط)
app.get('/api/setup-webhook', async (req, res) => {
    try {
        // استبدل هذا الرابط برابط مشروع Vercel الحقيقي الخاص بك
        const webhookUrl = 'https://raihana-store.vercel.app/api/bot-webhook'; 
        await bot.telegram.setWebhook(webhookUrl);
        res.send(`✅ تم ربط البوت بنجاح بالرابط: ${webhookUrl}`);
    } catch (e) {
        res.status(500).send('❌ خطأ في الربط: ' + e.message);
    }
});

// المسار المخفي الذي سيستقبل رسائل تليجرام (Webhook)
app.use(bot.webhookCallback('/api/bot-webhook'));

// المسار القديم الخاص بتأكيد الفاتورة (بقي كما هو بالضبط ليعمل مع موقعك)
app.post('/api/confirm-order', async (req, res) => {
    // ... (ضع كود تأكيد الطلب السابق هنا بالكامل) ...
    res.json({ success: true, message: "تم الاستلام" });
});

module.exports = app;

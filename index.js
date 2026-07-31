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

// التعامل مع أمر البدء وتأكيد الطلب
bot.start(async (ctx) => {
    const text = ctx.message.text; // مثال: "/start order_36"
    const payload = text.split(' ')[1]; // "order_36"
    
    if (!payload || !payload.startsWith('order_')) {
        return ctx.reply('أهلاً بك في متجر ريحانة! 🌿 يرجى تقديم طلباتك من خلال موقعنا الإلكتروني.');
    }

    const orderId = payload.replace('order_', '');
    const chatId = ctx.chat.id;

    try {
        await ctx.reply('⏳ جاري مطابقة بيانات طلبك في النظام...');

        // البحث عن الطلب في قاعدة البيانات
        const { data: order, error: fetchError } = await supabase
            .from('platform_orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (fetchError || !order) {
            return ctx.reply('❌ عذراً، لم نتمكن من العثور على طلبك في النظام.');
        }

        if (order.status === 'مكتمل' || (order.telegram_chat_id && order.telegram_chat_id.trim() !== '')) {
            return ctx.reply('❌ عذراً، هذا الطلب تم تأكيده مسبقاً.');
        }

        // تحديث الطلب برقم محادثة الزبون وتغيير حالته
        const { error: updateError } = await supabase
            .from('platform_orders')
            .update({ 
                telegram_chat_id: chatId.toString(),
                status: 'قيد التجهيز' 
            })
            .eq('id', orderId);

        if (updateError) {
            console.error('خطأ التحديث:', updateError);
            return ctx.reply('❌ حدث خطأ أثناء تحديث الطلب.');
        }

        await ctx.reply(`🎉 أهلاً بك في متجر ريحانة!\n\n✅ تم تأكيد طلبك بنجاح.\n🧾 رقم الفاتورة: #9000${orderId}\n📦 الحالة: قيد التجهيز الآن 🌿\n\nسنقوم بإرسال تحديثات التوصيل لك هنا مباشرة! 🛵`);

    } catch (err) {
        console.error('خطأ عام:', err);
        await ctx.reply('❌ حدث خطأ غير متوقع.');
    }
});

// نقطة استلام رسائل تليجرام (Webhook)
app.post(`/api/webhook`, async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (err) {
        console.error('خطأ في الويب هوك:', err);
        res.status(500).send('Error');
    }
});

// أداة تلقائية لربط تليجرام مع Vercel بضغطة زر واحدة
app.get('/api/set-webhook', async (req, res) => {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const url = `${protocol}://${host}/api/webhook`;
    try {
        await bot.telegram.setWebhook(url);
        res.send(`✅ تم ربط البوت بنجاح مع الرابط: ${url}`);
    } catch (e) {
        res.status(500).send(`❌ فشل ربط الويب هوك: ${e.message}`);
    }
});

app.get('/', (req, res) => {
    res.send('Raihana Store Bot is running on Vercel! 🚀');
});

module.exports = app;

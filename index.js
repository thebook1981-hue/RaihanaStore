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

// عند دخول المستخدم للبوت بأي طريقة
bot.start(async (ctx) => {
    const text = ctx.message.text;
    const payload = text.split(' ')[1]; // إذا مرر رقم الطلب مباشرة

    if (payload && payload.startsWith('order_')) {
        const orderId = payload.replace('order_', '');
        return handleOrderByID(ctx, orderId);
    }

    // إذا وصل الأمر فارغاً، نطلب منه مشاركة رقمه بأمان تام
    await ctx.reply(
        'أهلاً بك في متجر ريحانة! 🌿\nلأمانك وتأكيد طلبك بدقة، يرجى مشاركة رقم هاتفك معنا بالضغط على الزر أدناه:',
        {
            reply_markup: {
                keyboard: [
                    [{ text: '📱 مشاركة رقم الهاتف لتأكيد الطلب', request_contact: true }]
                ],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        }
    );
});

// دالة لمعالجة الطلب عبر رقم الطلب المباشر
async function handleOrderByID(ctx, orderId) {
    const chatId = ctx.chat.id;
    try {
        const { data: order, error } = await supabase
            .from('platform_orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (error || !order) {
            return ctx.reply('❌ عذراً، لم نتمكن من العثور على الطلب.');
        }

        if (order.status === 'مكتمل') {
            return ctx.reply('❌ عذراً، هذا الطلب تم تأكيده مسبقاً.');
        }

        await supabase
            .from('platform_orders')
            .update({ telegram_chat_id: chatId.toString(), status: 'قيد التجهيز' })
            .eq('id', orderId);

        await ctx.reply(`🎉 أهلاً بك في متجر ريحانة!\n\n✅ تم تأكيد طلبك بنجاح.\n🧾 رقم الفاتورة: #9000${orderId}\n📦 الحالة: قيد التجهيز الآن 🌿`);
    } catch (e) {
        ctx.reply('❌ حدث خطأ غير متوقع.');
    }
}

// الاستماع لمشاركة رقم الهاتف من الزبون (التحقق الآمن)
bot.on('contact', async (ctx) => {
    const contact = ctx.message.contact;
    let phone = contact.phone_number; // مثال: 9647701216260 أو 0770...
    const chatId = ctx.chat.id;

    // تنظيف وتوحيد شكل رقم الهاتف لضمان المطابقة الدقيقة مع قاعدة البيانات
    const cleanPhone = phone.replace('+', '');

    try {
        await ctx.reply('⏳ جاري البحث عن طلباتك برقم الهاتف...');

        // البحث في سوبابيس عن أحدث طلب غير مؤكد يطابق رقم الهاتف
        const { data: orders, error } = await supabase
            .from('platform_orders')
            .select('*')
            .or(`customer_phone.ilike.%${cleanPhone}%,customer_phone.ilike.%${phone}%`)
            .neq('status', 'مكتمل')
            .order('created_at', { ascending: false })
            .limit(1);

        if (error || !orders || orders.length === 0) {
            return ctx.reply('❌ لا توجد طلبات جديدة معلقة مرتبطة برقم الهاتفك هذا.');
        }

        const order = orders[0];

        // تحديث الطلب برقم المحادثة وحالته
        await supabase
            .from('platform_orders')
            .update({ 
                telegram_chat_id: chatId.toString(),
                status: 'قيد التجهيز' 
            })
            .eq('id', order.id);

        // إخفاء الكيبورد بعد المشاركة
        await ctx.reply(`🎉 أهلاً بك في متجر ريحانة!\n\n✅ تم مطابقة وتأكيد طلبك بنجاح بناءً على رقم هاتفك.\n🧾 رقم الفاتورة: #9000${order.id}\n📦 الحالة: قيد التجهيز الآن 🌿`, {
            reply_markup: { remove_keyboard: true }
        });

    } catch (err) {
        console.error(err);
        await ctx.reply('❌ حدث خطأ أثناء مطابقة البيانات.');
    }
});

app.post(`/api/webhook`, async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (err) {
        res.status(500).send('Error');
    }
});

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
    res.send('Raihana Store Bot is running securely! 🚀');
});

module.exports = app;

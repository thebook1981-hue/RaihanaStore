const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const express = require('express');

// 1. سيرفر ويب بسيط لإبقاء البوت مستيقظاً في Render
const app = express();
app.get('/', (req, res) => res.send('🤖 بوت ريحانة يعمل بنجاح سحابياً!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🌐 سيرفر الويب يعمل على المنفذ ${port}...`));

// 2. جلب البيانات السرية من إعدادات Render
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// 3. تهيئة البوت وقاعدة البيانات
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log("🤖 بوت ريحانة مستعد لاستقبال الطلبات...");

// 4. معالجة أوامر التليجرام
bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const payload = match[1]; 

    if (payload.startsWith('order_')) {
        const orderId = payload.split('_')[1];
        bot.sendMessage(chatId, '⏳ جاري مطابقة بيانات طلبك في النظام...');

        try {
            // تحديث حالة الطلب وحفظ رقم محادثة تليجرام
            const { data, error } = await supabase
                .from('platform_orders')
                .update({ 
                    status: 'قيد التجهيز', 
                    telegram_chat_id: chatId.toString() 
                })
                .eq('id', orderId)
                .select();

            if (error || !data || data.length === 0) {
                console.error("خطأ:", error);
                return bot.sendMessage(chatId, '❌ عذراً، لم نتمكن من العثور على طلبك، أو أنه تم تأكيده مسبقاً.');
            }

            const invoiceCode = `#9${orderId.toString().padStart(5, '0')}`;
            const successMsg = `🎉 أهلاً بك في متجر ريحانة!\n\n` +
                               `✅ تم تأكيد طلبك بنجاح.\n` +
                               `🧾 **رقم الفاتورة:** ${invoiceCode}\n` +
                               `📦 **الحالة:** قيد التجهيز الآن 🌿\n\n` +
                               `سنقوم بإرسال تحديثات التوصيل لك هنا مباشرة! 🛵`;

            bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });

        } catch (err) {
            bot.sendMessage(chatId, '⚠️ حدث خطأ غير متوقع في الخوادم، يرجى المحاولة لاحقاً.');
        }
    }
});

bot.onText(/\/start$/, (msg) => {
    bot.sendMessage(msg.chat.id, '🌿 مرحباً بك في متجر ريحانة.\n\nهذا البوت مخصص لتأكيد الطلبات. يرجى إتمام طلبك من الموقع أولاً والضغط على زر تليجرام ليتم تحويلك مع رقم فاتورتك بشكل صحيح.');
});

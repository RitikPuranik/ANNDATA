import type { Lang } from "./whatsapp.types";

type Entry = { en: string; hi: string; hinglish: string };

/**
 * Short, farmer-friendly messages. `{placeholders}` are substituted by `t()`.
 * Crop names are passed in as-is (never translated by us) so they cannot be
 * mistranslated; Hindi names come from CropTranslation in the database.
 */
const M = {
  help: {
    en: "🌾 ANNDATA Farmer Assistant\n\nYou can ask me:\n\n👨‍🌾 \"buyer\"\nFind buyers for your crop\n\n💰 \"bhav\"\nCheck mandi prices\n\n📦 \"my lot\"\nView your active lots\n\n🤝 \"offers\"\nView buyer offers\n\n💳 \"payment\"\nCheck payment status\n\n🚚 \"shipment\"\nTrack your shipment\n\nYou can also type naturally.\nExample: \"I have 20 quintal wheat, find buyer\"",
    hi: "🌾 ANNDATA किसान सहायक\n\nआप मुझसे पूछ सकते हैं:\n\n👨‍🌾 \"buyer\"\nअपनी फसल के लिए खरीदार खोजें\n\n💰 \"bhav\"\nमंडी भाव देखें\n\n📦 \"my lot\"\nअपने सक्रिय लॉट देखें\n\n🤝 \"offers\"\nखरीदारों के ऑफर देखें\n\n💳 \"payment\"\nभुगतान की स्थिति देखें\n\n🚚 \"shipment\"\nअपनी शिपमेंट ट्रैक करें\n\nआप सामान्य भाषा में भी लिख सकते हैं।\nउदाहरण: \"मेरे पास 20 क्विंटल गेहूं है, खरीदार ढूंढो\"",
    hinglish: "🌾 ANNDATA Farmer Assistant\n\nAap mujhse ye puch sakte hain:\n\n👨‍🌾 \"buyer\"\nApni fasal ke liye buyer dhoondhein\n\n💰 \"bhav\"\nMandi bhav dekhein\n\n📦 \"my lot\"\nApne active lot dekhein\n\n🤝 \"offers\"\nBuyer offers dekhein\n\n💳 \"payment\"\nPayment status dekhein\n\n🚚 \"shipment\"\nShipment track karein\n\nAap aam bhasha mein bhi likh sakte hain.\nExample: \"Mere paas 20 quintal wheat hai, buyer dhoondho\"",
  },
  guestHelp: {
    en: "🌾 Welcome to ANNDATA!\n\nNo registration needed for these — try them right here:\n\n👨‍🌾 \"buyer\"\nTell me your crop and I'll show buyers with open demand\n\n💰 \"bhav\"\nCheck mandi prices\n\nℹ️ \"how it works\"\nSee how ANNDATA works\n\n🌐 \"register\"\nGet the ANNDATA website link\n\nYou can also type naturally.\nExample: \"I have 20 quintal wheat, find buyer\"\n\nTo publish a lot, send offers, or track payments and shipments, register on ANNDATA (free).\nAlready registered? Open ANNDATA → Profile, get your WhatsApp link code, then send:\nLINK <code>",
    hi: "🌾 ANNDATA में आपका स्वागत है!\n\nइनके लिए रजिस्ट्रेशन की ज़रूरत नहीं — यहीं आज़माएं:\n\n👨‍🌾 \"buyer\"\nअपनी फसल बताएं, मैं खुली मांग वाले खरीदार दिखाऊँगा\n\n💰 \"bhav\"\nमंडी भाव देखें\n\nℹ️ \"how it works\"\nजानें ANNDATA कैसे काम करता है\n\n🌐 \"register\"\nANNDATA वेबसाइट का लिंक पाएं\n\nआप सामान्य भाषा में भी लिख सकते हैं।\nउदाहरण: \"मेरे पास 20 क्विंटल गेहूं है, खरीदार ढूंढो\"\n\nलॉट पब्लिश करने, ऑफर भेजने या भुगतान और शिपमेंट ट्रैक करने के लिए ANNDATA पर रजिस्टर करें (मुफ़्त)।\nपहले से रजिस्टर हैं? ANNDATA → प्रोफाइल से WhatsApp लिंक कोड लें, फिर भेजें:\nLINK <कोड>",
    hinglish: "🌾 ANNDATA mein aapka swagat hai!\n\nIn sab ke liye registration ki zaroorat nahi — yahin try karein:\n\n👨‍🌾 \"buyer\"\nApni fasal batayein, main open demand wale buyers dikhaunga\n\n💰 \"bhav\"\nMandi bhav dekhein\n\nℹ️ \"how it works\"\nJaanein ANNDATA kaise kaam karta hai\n\n🌐 \"register\"\nANNDATA website ka link paayein\n\nAap aam bhasha mein bhi likh sakte hain.\nExample: \"Mere paas 20 quintal wheat hai, buyer dhoondho\"\n\nLot publish karne, offer bhejne ya payment aur shipment track karne ke liye ANNDATA par register karein (free).\nPehle se registered hain? ANNDATA → Profile se WhatsApp link code lein, phir bhejein:\nLINK <code>",
  },
  aboutANNDATA: {
    en: "🌾 How ANNDATA works\n\n1️⃣ Register free and add your farm and crop.\n2️⃣ Publish a lot: crop, quantity and quality.\n3️⃣ See verified buyers who have open demand for your crop.\n4️⃣ Send or receive offers and agree on a rate. No buyer is guaranteed to purchase until an offer is accepted.\n5️⃣ Arrange transport, track the shipment and see payment status. The buyer pays you directly; ANNDATA tracks it.\n\nType \"help\" to see what I can do here.",
    hi: "🌾 ANNDATA कैसे काम करता है\n\n1️⃣ मुफ़्त रजिस्टर करें और अपना खेत व फसल जोड़ें।\n2️⃣ लॉट पब्लिश करें: फसल, मात्रा और क्वालिटी।\n3️⃣ अपनी फसल की खुली मांग वाले सत्यापित खरीदार देखें।\n4️⃣ ऑफर भेजें या पाएं और रेट तय करें। ऑफर स्वीकार होने तक किसी खरीदार की खरीदारी की गारंटी नहीं है।\n5️⃣ ट्रांसपोर्ट तय करें, शिपमेंट ट्रैक करें और भुगतान की स्थिति देखें। खरीदार सीधे आपको भुगतान करता है; ANNDATA उसे ट्रैक करता है।\n\nमैं यहाँ क्या कर सकता हूँ, यह देखने के लिए \"help\" लिखें।",
    hinglish: "🌾 ANNDATA kaise kaam karta hai\n\n1️⃣ Free register karein aur apna khet aur fasal add karein.\n2️⃣ Lot publish karein: fasal, quantity aur quality.\n3️⃣ Apni fasal ke liye open demand wale verified buyers dekhein.\n4️⃣ Offer bhejein ya paayein aur rate tay karein. Offer accept hone tak kisi buyer ki kharidari ki guarantee nahi hai.\n5️⃣ Transport tay karein, shipment track karein aur payment status dekhein. Buyer seedha aapko payment karta hai; ANNDATA use track karta hai.\n\nMain yahan kya kar sakta hoon, ye dekhne ke liye \"help\" likhein.",
  },
  guestGate: {
    en: "🔒 To {what}, you need a ANNDATA account.\n\n🌐 Continue on ANNDATA to register (free) or log in. Then link this WhatsApp number from your Profile to use it here.",
    hi: "🔒 {what} के लिए आपको ANNDATA अकाउंट चाहिए।\n\n🌐 ANNDATA पर जारी रखें: रजिस्टर करें (मुफ़्त) या लॉगिन करें। फिर यहाँ इस्तेमाल करने के लिए प्रोफाइल से यह WhatsApp नंबर जोड़ें।",
    hinglish: "🔒 {what} ke liye aapko ANNDATA account chahiye.\n\n🌐 ANNDATA par continue karein: register (free) ya login karein. Phir yahan use karne ke liye Profile se ye WhatsApp number link karein.",
  },
  gateLots: {
    en: "manage your lots",
    hi: "अपने लॉट मैनेज करने",
    hinglish: "apne lots manage karne",
  },
  gateOffers: {
    en: "see your offers",
    hi: "अपने ऑफर देखने",
    hinglish: "apne offers dekhne",
  },
  gatePayments: {
    en: "see your payments",
    hi: "अपने भुगतान देखने",
    hinglish: "apne payments dekhne",
  },
  gateShipments: {
    en: "track your shipments",
    hi: "अपनी शिपमेंट ट्रैक करने",
    hinglish: "apni shipment track karne",
  },
  gateSendOffer: {
    en: "send an offer",
    hi: "ऑफर भेजने",
    hinglish: "offer bhejne",
  },
  gateFarms: {
    en: "manage your farms and crops",
    hi: "अपने खेत और फसल मैनेज करने",
    hinglish: "apne khet aur fasal manage karne",
  },
  gateGeneric: {
    en: "do this",
    hi: "यह करने",
    hinglish: "ye karne",
  },
  guestBuyersNote: {
    en: "🔒 To publish your lot and send an offer, continue on ANNDATA (free registration).",
    hi: "🔒 अपना लॉट पब्लिश करने और ऑफर भेजने के लिए ANNDATA पर जारी रखें (रजिस्ट्रेशन मुफ़्त)।",
    hinglish: "🔒 Apna lot publish karne aur offer bhejne ke liye ANNDATA par continue karein (registration free).",
  },
  guestNoBuyers: {
    en: "😔 No matching buyers right now for {crop}.\n\nNew buyers post demand often — try again soon, or register on ANNDATA to publish your lot.",
    hi: "😔 अभी {crop} के लिए कोई मेल खाता खरीदार नहीं है।\n\nनई मांग आती रहती है — थोड़ी देर बाद फिर कोशिश करें, या ANNDATA पर रजिस्टर करके अपना लॉट पब्लिश करें।",
    hinglish: "😔 Abhi {crop} ke liye koi matching buyer nahi hai.\n\nNayi demand aati rehti hai — thodi der baad phir try karein, ya ANNDATA par register karke apna lot publish karein.",
  },
  guestWebsite: {
    en: "🌐 ANNDATA is on the web too.\n\nRegister (free) or log in to publish lots, send offers and track payments and shipments.",
    hi: "🌐 ANNDATA वेबसाइट पर भी उपलब्ध है।\n\nलॉट पब्लिश करने, ऑफर भेजने और भुगतान व शिपमेंट ट्रैक करने के लिए रजिस्टर करें (मुफ़्त) या लॉगिन करें।",
    hinglish: "🌐 ANNDATA website par bhi available hai.\n\nLot publish karne, offer bhejne aur payment aur shipment track karne ke liye register (free) ya login karein.",
  },
  guestFallback: {
    en: "I can help you find buyers, check mandi prices and explain how ANNDATA works — no registration needed.\n\nWhat would you like to do? Type \"help\" for the menu.",
    hi: "मैं खरीदार खोजने, मंडी भाव देखने और ANNDATA कैसे काम करता है यह समझाने में मदद कर सकता हूँ — रजिस्ट्रेशन की ज़रूरत नहीं।\n\nआप क्या करना चाहते हैं? मेनू के लिए \"help\" लिखें।",
    hinglish: "Main buyer dhoondhne, mandi bhav dekhne aur ANNDATA kaise kaam karta hai ye samjhane mein madad kar sakta hoon — registration ki zaroorat nahi.\n\nAap kya karna chahte hain? Menu ke liye \"help\" likhein.",
  },
  guestTextOnly: {
    en: "I can currently process text messages.\n\nTry:\nbuyer\nbhav\nhow it works\nregister\nhelp",
    hi: "मैं अभी सिर्फ़ टेक्स्ट संदेश समझ सकता हूँ।\n\nकोशिश करें:\nbuyer\nbhav\nhow it works\nregister\nhelp",
    hinglish: "Main abhi sirf text messages samajh sakta hoon.\n\nTry karein:\nbuyer\nbhav\nhow it works\nregister\nhelp",
  },
  linkOk: {
    en: "✅ Done! Your WhatsApp is now linked to ANNDATA.\n\nType \"help\" to see what I can do.",
    hi: "✅ हो गया! आपका WhatsApp अब ANNDATA से जुड़ गया है।\n\n\"help\" लिखें और देखें मैं क्या कर सकता हूँ।",
    hinglish: "✅ Ho gaya! Aapka WhatsApp ab ANNDATA se link ho gaya hai.\n\n\"help\" likhein aur dekhein main kya kar sakta hoon.",
  },
  linkBad: {
    en: "⚠️ That link code is not valid or has expired.\n\nPlease get a new code from ANNDATA → Profile and send:\nLINK <code>",
    hi: "⚠️ यह लिंक कोड सही नहीं है या समाप्त हो गया है।\n\nANNDATA → प्रोफाइल से नया कोड लें और भेजें:\nLINK <कोड>",
    hinglish: "⚠️ Ye link code sahi nahi hai ya expire ho gaya hai.\n\nANNDATA → Profile se naya code lein aur bhejein:\nLINK <code>",
  },
  linkTooMany: {
    en: "⚠️ Too many wrong attempts. Please try again after some time.",
    hi: "⚠️ बहुत ज़्यादा गलत प्रयास। कृपया कुछ देर बाद कोशिश करें।",
    hinglish: "⚠️ Bahut zyada galat koshish. Kripya kuch der baad try karein.",
  },
  askCrop: {
    en: "🌾 What do you want to sell?\n\nReply with a number, or type the crop name.",
    hi: "🌾 आप क्या बेचना चाहते हैं?\n\nनंबर भेजें या फसल का नाम लिखें।",
    hinglish: "🌾 Aap kya bechna chahte hain?\n\nNumber bhejein ya fasal ka naam likhein.",
  },
  askCropPrice: {
    en: "🌾 Which crop's mandi price do you want?\n\nReply with a number, or type the crop name.",
    hi: "🌾 किस फसल का मंडी भाव चाहिए?\n\nनंबर भेजें या फसल का नाम लिखें।",
    hinglish: "🌾 Kis fasal ka mandi bhav chahiye?\n\nNumber bhejein ya fasal ka naam likhein.",
  },
  askCropName: {
    en: "Please type the crop name. Example: Bajra",
    hi: "कृपया फसल का नाम लिखें। उदाहरण: बाजरा",
    hinglish: "Fasal ka naam likhein. Example: Bajra",
  },
  cropNotFound: {
    en: "I couldn't find \"{text}\" in ANNDATA's crop list.\n\nTry another spelling, or add it on ANNDATA.",
    hi: "\"{text}\" ANNDATA की फसल सूची में नहीं मिला।\n\nदूसरी वर्तनी लिखें, या ANNDATA पर जोड़ें।",
    hinglish: "\"{text}\" ANNDATA ki crop list mein nahi mila.\n\nDusri spelling likhein, ya ANNDATA par add karein.",
  },
  askQuantity: {
    en: "How much {crop} do you want to sell?\n\nExample: 20 quintal",
    hi: "कितना {crop} बेचना है?\n\nउदाहरण: 20 क्विंटल",
    hinglish: "Kitna {crop} bechna hai?\n\nExample: 20 quintal",
  },
  badQuantity: {
    en: "I didn't get the quantity. Please write it like: 20 quintal",
    hi: "मात्रा समझ नहीं आई। ऐसे लिखें: 20 क्विंटल",
    hinglish: "Quantity samajh nahi aayi. Aise likhein: 20 quintal",
  },
  quantityNoted: {
    en: "🌾 {crop}: {qty} noted.",
    hi: "🌾 {crop}: {qty} नोट किया।",
    hinglish: "🌾 {crop}: {qty} note kiya.",
  },
  askLocation: {
    en: "📍 Where is your {crop} located?\n\nExample: Sehore",
    hi: "📍 आपका {crop} कहाँ है?\n\nउदाहरण: सीहोर",
    hinglish: "📍 Aapka {crop} kahan pada hai?\n\nExample: Sehore",
  },
  askLocationPrice: {
    en: "📍 Which district or mandi area?\n\nExample: Sehore",
    hi: "📍 कौन सा जिला या मंडी क्षेत्र?\n\nउदाहरण: सीहोर",
    hinglish: "📍 Kaun sa district ya mandi area?\n\nExample: Sehore",
  },
  locationNotFound: {
    en: "I couldn't find \"{text}\". Please type your district or nearby mandi name.",
    hi: "\"{text}\" नहीं मिला। कृपया अपना जिला या नज़दीकी मंडी का नाम लिखें।",
    hinglish: "\"{text}\" nahi mila. Apna district ya nazdeeki mandi ka naam likhein.",
  },
  askQuality: {
    en: "What is the quality?\n\n1️⃣ Grade A\n2️⃣ Grade B\n3️⃣ Don't know",
    hi: "क्वालिटी कैसी है?\n\n1️⃣ ग्रेड A\n2️⃣ ग्रेड B\n3️⃣ पता नहीं",
    hinglish: "Quality kya hai?\n\n1️⃣ Grade A\n2️⃣ Grade B\n3️⃣ Pata nahi",
  },
  askFarm: {
    en: "Which farm is this {crop} from?",
    hi: "यह {crop} किस खेत का है?",
    hinglish: "Ye {crop} kis khet ka hai?",
  },
  noFarm: {
    en: "🌱 To list a lot, you first need a farm on ANNDATA. Please add your farm and crop on the website.",
    hi: "🌱 लॉट बनाने के लिए पहले ANNDATA पर अपना खेत जोड़ना होगा। कृपया वेबसाइट पर खेत और फसल जोड़ें।",
    hinglish: "🌱 Lot banane ke liye pehle ANNDATA par apna khet add karna hoga. Kripya website par khet aur fasal add karein.",
  },
  cropNotOnFarm: {
    en: "🌱 {crop} isn't added to that farm yet. Please add it on ANNDATA, then come back.",
    hi: "🌱 {crop} अभी उस खेत में जुड़ा नहीं है। ANNDATA पर जोड़ें, फिर वापस आएं।",
    hinglish: "🌱 {crop} abhi us khet mein add nahi hai. ANNDATA par add karein, phir wapas aayein.",
  },
  reuseLot: {
    en: "You already have this lot:\n\n🌾 {crop}\n📦 {qty}\n📍 {place}\n🟢 {status}\n\nUse it, or create a new lot?",
    hi: "आपके पास यह लॉट पहले से है:\n\n🌾 {crop}\n📦 {qty}\n📍 {place}\n🟢 {status}\n\nइसे इस्तेमाल करें या नया लॉट बनाएं?",
    hinglish: "Aapke paas ye lot pehle se hai:\n\n🌾 {crop}\n📦 {qty}\n📍 {place}\n🟢 {status}\n\nIse use karein ya naya lot banayein?",
  },
  confirmLot: {
    en: "Please confirm your lot:\n\n🌾 {crop}\n📦 {qty}\n📍 {place}\n⭐ Quality: {grade}\n\nCreate this lot on ANNDATA?",
    hi: "कृपया अपना लॉट कन्फर्म करें:\n\n🌾 {crop}\n📦 {qty}\n📍 {place}\n⭐ क्वालिटी: {grade}\n\nक्या ANNDATA पर यह लॉट बनाएं?",
    hinglish: "Apna lot confirm karein:\n\n🌾 {crop}\n📦 {qty}\n📍 {place}\n⭐ Quality: {grade}\n\nANNDATA par ye lot banayein?",
  },
  lotCreated: {
    en: "✅ Lot created and listed for buyers.",
    hi: "✅ लॉट बन गया और खरीदारों के लिए लिस्ट हो गया।",
    hinglish: "✅ Lot ban gaya aur buyers ke liye list ho gaya.",
  },
  searching: {
    en: "🔎 Looking for buyers...",
    hi: "🔎 खरीदार ढूंढ रहा हूँ...",
    hinglish: "🔎 Buyer dhoond raha hoon...",
  },
  buyersFound: {
    en: "🌾 I found {n} relevant buyer(s) for your {crop}.",
    hi: "🌾 आपके {crop} के लिए {n} खरीदार मिले।",
    hinglish: "🌾 Aapke {crop} ke liye {n} relevant buyer mile.",
  },
  buyersRefPrice: {
    en: "💰 Mandi reference: {price}/Q (market price, not a buyer's offer)",
    hi: "💰 मंडी संदर्भ भाव: {price}/Q (बाज़ार भाव, खरीदार का ऑफर नहीं)",
    hinglish: "💰 Mandi reference: {price}/Q (market price, buyer ka offer nahi)",
  },
  buyersDisclaimer: {
    en: "ℹ️ These are buyers with open demand. A buyer is not guaranteed to purchase until they accept an offer.",
    hi: "ℹ️ ये खुली मांग वाले खरीदार हैं। ऑफर स्वीकार करने तक खरीदारी की गारंटी नहीं है।",
    hinglish: "ℹ️ Ye open demand wale buyers hain. Offer accept hone tak kharidari ki guarantee nahi hai.",
  },
  noBuyers: {
    en: "😔 No matching buyers right now for your {crop}.\n\nNew buyers post demand often — try again soon.",
    hi: "😔 अभी आपके {crop} के लिए कोई मेल खाता खरीदार नहीं है।\n\nनई मांग आती रहती है — थोड़ी देर बाद फिर कोशिश करें।",
    hinglish: "😔 Abhi aapke {crop} ke liye koi matching buyer nahi hai.\n\nNayi demand aati rehti hai — thodi der baad phir try karein.",
  },
  noMoreBuyers: {
    en: "That's all the buyers I have for now.",
    hi: "अभी के लिए इतने ही खरीदार हैं।",
    hinglish: "Abhi ke liye itne hi buyers hain.",
  },
  whichBuyerDetails: {
    en: "Which buyer? Reply with the number.",
    hi: "कौन सा खरीदार? नंबर भेजें।",
    hinglish: "Kaun sa buyer? Number bhejein.",
  },
  whichBuyerOffer: {
    en: "Which buyer do you want to send an offer to? Reply with the number.",
    hi: "किस खरीदार को ऑफर भेजना है? नंबर भेजें।",
    hinglish: "Kis buyer ko offer bhejna hai? Number bhejein.",
  },
  askOfferPrice: {
    en: "At what rate do you want to sell to {buyer}?\n\nType price {per}. Example: 2500",
    hi: "{buyer} को किस रेट पर बेचना है?\n\nभाव लिखें {per}। उदाहरण: 2500",
    hinglish: "{buyer} ko kis rate par bechna hai?\n\nRate likhein {per}. Example: 2500",
  },
  badPrice: {
    en: "I didn't get the price. Please type a number, like 2500",
    hi: "भाव समझ नहीं आया। संख्या लिखें, जैसे 2500",
    hinglish: "Rate samajh nahi aaya. Number likhein, jaise 2500",
  },
  confirmOffer: {
    en: "Please confirm your offer:\n\n🏢 {buyer}\n🌾 {crop}\n📦 {qty}\n💰 {price} {per}\n🧾 Total: {total}\n\nSend this offer?",
    hi: "कृपया अपना ऑफर कन्फर्म करें:\n\n🏢 {buyer}\n🌾 {crop}\n📦 {qty}\n💰 {price} {per}\n🧾 कुल: {total}\n\nयह ऑफर भेजें?",
    hinglish: "Apna offer confirm karein:\n\n🏢 {buyer}\n🌾 {crop}\n📦 {qty}\n💰 {price} {per}\n🧾 Total: {total}\n\nYe offer bhejein?",
  },
  offerSent: {
    en: "✅ Offer sent to {buyer}. This is an *offer request* — the buyer has not accepted yet. I'll show its status under \"offers\".",
    hi: "✅ {buyer} को ऑफर भेज दिया गया। यह सिर्फ *ऑफर* है — खरीदार ने अभी स्वीकार नहीं किया। स्थिति \"offers\" में देखें।",
    hinglish: "✅ {buyer} ko offer bhej diya. Ye sirf *offer* hai — buyer ne abhi accept nahi kiya. Status \"offers\" mein dekhein.",
  },
  buyerDetails: {
    en: "🏢 {buyer}\n📍 {place}\n📦 Demand: {qty}\n✅ Verified buyer\n\nThis is the buyer's open demand — not an offer or a guarantee to buy.",
    hi: "🏢 {buyer}\n📍 {place}\n📦 मांग: {qty}\n✅ सत्यापित खरीदार\n\nयह खरीदार की खुली मांग है — ऑफर या खरीदारी की गारंटी नहीं।",
    hinglish: "🏢 {buyer}\n📍 {place}\n📦 Demand: {qty}\n✅ Verified buyer\n\nYe buyer ki open demand hai — offer ya kharidari ki guarantee nahi.",
  },
  lotsHeader: {
    en: "🌾 Your Active Lots",
    hi: "🌾 आपके सक्रिय लॉट",
    hinglish: "🌾 Aapke Active Lots",
  },
  noLots: {
    en: "You have no active lots yet.\n\nType \"buyer\" to list your crop and find buyers.",
    hi: "आपका अभी कोई सक्रिय लॉट नहीं है।\n\n\"buyer\" लिखें और अपनी फसल लिस्ट करें।",
    hinglish: "Aapka abhi koi active lot nahi hai.\n\n\"buyer\" likhein aur apni fasal list karein.",
  },
  offersHeader: {
    en: "💰 Your Buyer Offers",
    hi: "💰 आपके खरीदार ऑफर",
    hinglish: "💰 Aapke Buyer Offers",
  },
  noOffers: {
    en: "You have no offers yet.\n\nType \"buyer\" to find buyers and send an offer.",
    hi: "अभी कोई ऑफर नहीं है।\n\n\"buyer\" लिखें, खरीदार खोजें और ऑफर भेजें।",
    hinglish: "Abhi koi offer nahi hai.\n\n\"buyer\" likhein, buyer dhoondhein aur offer bhejein.",
  },
  offerAskCounter: {
    en: "What is your counter rate {per}? Example: 2600",
    hi: "आपका काउंटर रेट क्या है {per}? उदाहरण: 2600",
    hinglish: "Aapka counter rate kya hai {per}? Example: 2600",
  },
  confirmOfferAction: {
    en: "{action} this offer?\n\n🏢 {buyer}\n🌾 {crop}\n📦 {qty}\n💰 {price} {per}\n🧾 Total: {total}",
    hi: "{action} इस ऑफर को?\n\n🏢 {buyer}\n🌾 {crop}\n📦 {qty}\n💰 {price} {per}\n🧾 कुल: {total}",
    hinglish: "Is offer ko {action}?\n\n🏢 {buyer}\n🌾 {crop}\n📦 {qty}\n💰 {price} {per}\n🧾 Total: {total}",
  },
  offerDone: {
    en: "✅ Done — offer {result}.",
    hi: "✅ हो गया — ऑफर {result}।",
    hinglish: "✅ Ho gaya — offer {result}.",
  },
  ownOfferNote: {
    en: "This is your offer — waiting for the buyer.",
    hi: "यह आपका ऑफर है — खरीदार के जवाब का इंतज़ार है।",
    hinglish: "Ye aapka offer hai — buyer ke jawab ka intezaar hai.",
  },
  paymentHeader: {
    en: "💰 Payment Status",
    hi: "💰 भुगतान की स्थिति",
    hinglish: "💰 Payment Status",
  },
  noPayments: {
    en: "No payments to show yet. Payments appear here once a sale is accepted and delivered.",
    hi: "अभी कोई भुगतान नहीं है। सौदा स्वीकार और डिलीवर होने पर भुगतान यहाँ दिखेगा।",
    hinglish: "Abhi koi payment nahi hai. Deal accept aur deliver hone par payment yahan dikhega.",
  },
  paymentNote: {
    en: "ℹ️ ANNDATA tracks payments — the buyer pays you directly, outside ANNDATA.",
    hi: "ℹ️ ANNDATA भुगतान को ट्रैक करता है — खरीदार सीधे आपको भुगतान करता है।",
    hinglish: "ℹ️ ANNDATA payment track karta hai — buyer seedha aapko payment karta hai.",
  },
  shipmentHeader: {
    en: "🚚 Shipment Status",
    hi: "🚚 शिपमेंट की स्थिति",
    hinglish: "🚚 Shipment Status",
  },
  noShipments: {
    en: "No shipments yet. Shipments appear here once a sale is being delivered.",
    hi: "अभी कोई शिपमेंट नहीं है। डिलीवरी शुरू होने पर यहाँ दिखेगी।",
    hinglish: "Abhi koi shipment nahi hai. Delivery shuru hone par yahan dikhegi.",
  },
  noLiveLocation: {
    en: "📍 Live location is currently unavailable.",
    hi: "📍 लाइव लोकेशन अभी उपलब्ध नहीं है।",
    hinglish: "📍 Live location abhi available nahi hai.",
  },
  mandiHeader: {
    en: "🌾 {crop} Mandi Prices",
    hi: "🌾 {crop} मंडी भाव",
    hinglish: "🌾 {crop} Mandi Bhav",
  },
  mandiStale: {
    en: "⚠️ These prices are not fresh (last updated {date}). Please check again later.",
    hi: "⚠️ ये भाव ताज़ा नहीं हैं (आखिरी अपडेट {date})। कृपया बाद में फिर देखें।",
    hinglish: "⚠️ Ye bhav fresh nahi hain (last update {date}). Baad mein phir dekhein.",
  },
  mandiUnavailable: {
    en: "⚠️ I couldn't get fresh mandi prices right now.\n\nPlease try again later.",
    hi: "⚠️ अभी ताज़ा मंडी भाव नहीं मिल पाए।\n\nकृपया बाद में फिर कोशिश करें।",
    hinglish: "⚠️ Abhi fresh mandi bhav nahi mil paaye.\n\nKripya baad mein phir try karein.",
  },
  mandiTimestamp: {
    en: "Data timestamp:\n{date}",
    hi: "डेटा की तारीख:\n{date}",
    hinglish: "Data timestamp:\n{date}",
  },
  lowConfidence: {
    en: "I can help you find buyers, check prices, view lots, offers, payments, or shipments.\n\nWhat would you like to do?",
    hi: "मैं खरीदार खोजने, भाव देखने, लॉट, ऑफर, भुगतान या शिपमेंट देखने में मदद कर सकता हूँ।\n\nआप क्या करना चाहते हैं?",
    hinglish: "Main buyer dhoondhne, bhav dekhne, lot, offers, payment ya shipment dekhne mein madad kar sakta hoon.\n\nAap kya karna chahte hain?",
  },
  smartFallback: {
    en: "🌾 I can help with buyers, prices, lots, offers, payments and shipments.\n\nFor your complete ANNDATA dashboard:",
    hi: "🌾 मैं खरीदार, भाव, लॉट, ऑफर, भुगतान और शिपमेंट में मदद कर सकता हूँ।\n\nपूरे ANNDATA डैशबोर्ड के लिए:",
    hinglish: "🌾 Main buyer, bhav, lot, offers, payment aur shipment mein madad kar sakta hoon.\n\nPoore ANNDATA dashboard ke liye:",
  },
  websiteGeneric: {
    en: "📊 This is easier to view on ANNDATA.\n\nYou can see the full details there.",
    hi: "📊 इसे ANNDATA पर देखना आसान है।\n\nपूरी जानकारी वहाँ मिलेगी।",
    hinglish: "📊 Ye ANNDATA par dekhna aasan hai.\n\nPoori jaankari wahan milegi.",
  },
  websiteForm: {
    en: "📄 This needs a few more details.\n\nPlease continue on ANNDATA:",
    hi: "📄 इसके लिए कुछ और जानकारी चाहिए।\n\nकृपया ANNDATA पर जारी रखें:",
    hinglish: "📄 Iske liye kuch aur details chahiye.\n\nKripya ANNDATA par continue karein:",
  },
  websiteLogistics: {
    en: "🚜 Advanced transport planning is available on ANNDATA.",
    hi: "🚜 उन्नत परिवहन योजना ANNDATA पर उपलब्ध है।",
    hinglish: "🚜 Advanced transport planning ANNDATA par available hai.",
  },
  websitePayments: {
    en: "💳 You can see full payment details on your ANNDATA dashboard.",
    hi: "💳 पूरा भुगतान विवरण आप अपने ANNDATA डैशबोर्ड पर देख सकते हैं।",
    hinglish: "💳 Poora payment detail aap apne ANNDATA dashboard par dekh sakte hain.",
  },
  moreOnWebsite: {
    en: "See everything on ANNDATA:",
    hi: "सब कुछ ANNDATA पर देखें:",
    hinglish: "Sab kuch ANNDATA par dekhein:",
  },
  cancelled: {
    en: "Okay, cancelled. Type \"help\" anytime to see what I can do.",
    hi: "ठीक है, रद्द कर दिया। कभी भी \"help\" लिखें।",
    hinglish: "Theek hai, cancel kar diya. Kabhi bhi \"help\" likhein.",
  },
  nothingToGoBack: {
    en: "Nothing to go back to. Type \"help\" to see the menu.",
    hi: "पीछे जाने के लिए कुछ नहीं है। \"help\" लिखें।",
    hinglish: "Peeche jaane ke liye kuch nahi hai. \"help\" likhein.",
  },
  genericError: {
    en: "⚠️ I couldn't complete that right now.\n\nPlease try again in a moment.",
    hi: "⚠️ अभी यह पूरा नहीं हो पाया।\n\nकृपया थोड़ी देर में फिर कोशिश करें।",
    hinglish: "⚠️ Abhi ye complete nahi ho paya.\n\nKripya thodi der mein phir try karein.",
  },
  unsupportedMedia: {
    en: "I can currently process text messages.\n\nTry:\nbuyer\nbhav\nmy lot\noffers\npayment\nshipment\nhelp",
    hi: "मैं अभी सिर्फ़ टेक्स्ट संदेश समझ सकता हूँ।\n\nकोशिश करें:\nbuyer\nbhav\nmy lot\noffers\npayment\nshipment\nhelp",
    hinglish: "Main abhi sirf text messages samajh sakta hoon.\n\nTry karein:\nbuyer\nbhav\nmy lot\noffers\npayment\nshipment\nhelp",
  },
  slowDown: {
    en: "⏳ You're sending messages too fast. Please wait a minute and try again.",
    hi: "⏳ आप बहुत तेज़ संदेश भेज रहे हैं। कृपया एक मिनट रुककर फिर कोशिश करें।",
    hinglish: "⏳ Aap bahut tez messages bhej rahe hain. Ek minute ruk kar phir try karein.",
  },
  limitReached: {
    en: "⏳ You've reached the limit for this request for now. Please try again a little later.",
    hi: "⏳ अभी इस अनुरोध की सीमा पूरी हो गई है। कृपया थोड़ी देर बाद फिर कोशिश करें।",
    hinglish: "⏳ Abhi is request ki limit poori ho gayi hai. Thodi der baad phir try karein.",
  },
  offerExpired: {
    en: "⚠️ This offer has expired.",
    hi: "⚠️ यह ऑफर समाप्त हो गया है।",
    hinglish: "⚠️ Ye offer expire ho gaya hai.",
  },
  offerNotActionable: {
    en: "⚠️ This offer can't be changed in its current status.",
    hi: "⚠️ यह ऑफर अभी इस स्थिति में बदला नहीं जा सकता।",
    hinglish: "⚠️ Ye offer abhi is status mein badla nahi ja sakta.",
  },
  quantityUnavailable: {
    en: "⚠️ Not enough quantity is available in that lot for this action.",
    hi: "⚠️ इस काम के लिए उस लॉट में पर्याप्त मात्रा उपलब्ध नहीं है।",
    hinglish: "⚠️ Is kaam ke liye us lot mein enough quantity available nahi hai.",
  },
  lotNotReady: {
    en: "⚠️ This lot can't be listed for buyers right now. Please check it on ANNDATA.",
    hi: "⚠️ यह लॉट अभी खरीदारों के लिए लिस्ट नहीं हो सकता। ANNDATA पर देखें।",
    hinglish: "⚠️ Ye lot abhi buyers ke liye list nahi ho sakta. ANNDATA par dekhein.",
  },
  invalidChoice: {
    en: "Please reply with one of the numbers shown, or type \"help\".",
    hi: "कृपया दिखाए गए नंबरों में से एक भेजें, या \"help\" लिखें।",
    hinglish: "Dikhaye gaye numbers mein se ek bhejein, ya \"help\" likhein.",
  },
  yes: { en: "Yes", hi: "हाँ", hinglish: "Haan" },
  no: { en: "No", hi: "नहीं", hinglish: "Nahi" },
  useLot: { en: "Use this lot", hi: "यही लॉट लें", hinglish: "Yehi lot lein" },
  newLot: { en: "New lot", hi: "नया लॉट", hinglish: "Naya lot" },
  other: { en: "Other", hi: "अन्य", hinglish: "Other" },
  gradeA: { en: "Grade A", hi: "ग्रेड A", hinglish: "Grade A" },
  gradeB: { en: "Grade B", hi: "ग्रेड B", hinglish: "Grade B" },
  gradeUnknown: { en: "Don't know", hi: "पता नहीं", hinglish: "Pata nahi" },
  btnDetails: { en: "Buyer details", hi: "खरीदार विवरण", hinglish: "Buyer details" },
  btnOffer: { en: "Request offer", hi: "ऑफर भेजें", hinglish: "Offer bhejein" },
  btnMore: { en: "More buyers", hi: "और खरीदार", hinglish: "Aur buyers" },
  btnView: { en: "View offer", hi: "ऑफर देखें", hinglish: "Offer dekhein" },
  btnAccept: { en: "Accept", hi: "स्वीकार", hinglish: "Accept" },
  btnReject: { en: "Reject", hi: "अस्वीकार", hinglish: "Reject" },
  btnCounter: { en: "Counter", hi: "काउंटर", hinglish: "Counter" },
  btnWithdraw: { en: "Withdraw", hi: "वापस लें", hinglish: "Withdraw" },
  btnViewBuyers: { en: "View buyers", hi: "खरीदार देखें", hinglish: "Buyers dekhein" },
  btnViewOffers: { en: "View offers", hi: "ऑफर देखें", hinglish: "Offers dekhein" },
  btnChoose: { en: "Choose", hi: "चुनें", hinglish: "Chunein" },
  btnMoreItems: { en: "Show more", hi: "और दिखाएं", hinglish: "Aur dikhayein" },
  btnBackMenu: { en: "Menu", hi: "मेनू", hinglish: "Menu" },
  ctaOpen: { en: "🌐 Open ANNDATA", hi: "🌐 ANNDATA खोलें", hinglish: "🌐 Open ANNDATA" },
  ctaDashboard: { en: "📊 Open Dashboard", hi: "📊 डैशबोर्ड खोलें", hinglish: "📊 Open Dashboard" },
  ctaLot: { en: "📦 View Lot", hi: "📦 लॉट देखें", hinglish: "📦 View Lot" },
  ctaOffers: { en: "💰 View Offers", hi: "💰 ऑफर देखें", hinglish: "💰 View Offers" },
  ctaShipment: { en: "🚚 Track Shipment", hi: "🚚 शिपमेंट ट्रैक करें", hinglish: "🚚 Track Shipment" },
  ctaContinue: { en: "Continue on ANNDATA", hi: "ANNDATA पर जाएं", hinglish: "Continue on ANNDATA" },
  ctaLogistics: { en: "🚜 Open Logistics", hi: "🚜 लॉजिस्टिक्स खोलें", hinglish: "🚜 Open Logistics" },
  ctaAddFarm: { en: "🌱 Add Farm", hi: "🌱 खेत जोड़ें", hinglish: "🌱 Add Farm" },
  ctaProblem: { en: "Report a problem", hi: "समस्या बताएं", hinglish: "Problem batayein" },
} satisfies Record<string, Entry>;

export type MsgKey = keyof typeof M;

export function t(key: MsgKey, lang: Lang, params: Record<string, string | number> = {}): string {
  const entry: Entry = M[key];
  const template = entry[lang] || entry.hinglish || entry.en;
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => (name in params ? String(params[name]) : `{${name}}`));
}

export const ALL_MESSAGE_KEYS = Object.keys(M) as MsgKey[];
export function rawEntry(key: MsgKey): Entry {
  return M[key];
}

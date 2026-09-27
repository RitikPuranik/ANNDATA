import { Language, NotificationType } from "@prisma/client";

/**
 * Section 12/13/14 — notification templates keyed by NotificationType, one
 * {en, hi, mr} entry each (Anndata's actual multilingual set — see
 * User.preferredLanguage — as opposed to WhatsApp's own separate
 * {en, hi, hinglish} choice in whatsapp-i18n.ts, which this module does not
 * reuse or duplicate: they answer different questions — "what script does
 * this account read in" vs "how does this WhatsApp conversation read").
 *
 * `{placeholders}` are substituted by render() below. Section 13: "Variables
 * should be strongly typed or validated" — TemplateVars below is the
 * per-call contract; a variable the caller didn't supply is left as the
 * literal `{name}` rather than throwing (a missing var must never crash a
 * business transaction that is merely trying to notify someone about it —
 * see Section 52), and a value is always stringified through safeValue()
 * so nothing beyond a plain string/number/Date ever reaches a message
 * (Section 13: "do not allow arbitrary unvalidated template injection").
 */

export type TemplateVars = Record<string, string | number | Date | null | undefined>;

interface Entry {
  en: string;
  hi: string;
  mr: string;
}

interface Template {
  title: Entry;
  body: Entry;
}

function safeValue(value: TemplateVars[string]): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleDateString("en-IN");
  return String(value);
}

function renderEntry(entry: Entry, lang: Language, vars: TemplateVars): string {
  const raw = entry[lang] ?? entry.en;
  return raw.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (!(key in vars)) return match;
    return safeValue(vars[key]);
  });
}

/**
 * Section 14 — farmer-friendly language: no backend/state-machine
 * terminology ("TRADE_STATE_TRANSITION: ACCEPTED" is exactly what these
 * must never read like). Financial notifications always state the amount
 * plainly (Section 14: "do not hide important financial details") — the
 * caller is expected to pass a pre-formatted, already-currency-formatted
 * `amount` string (e.g. "₹25,000"), never a raw number the template would
 * have to guess how to format.
 */
const TEMPLATES: Record<NotificationType, Template> = {
  OFFER_RECEIVED: {
    title: { en: "New offer received", hi: "नया ऑफर मिला", mr: "नवीन ऑफर मिळाली" },
    body: {
      en: "Good news — {buyerName} offered {price} for your {cropName} lot. Open the offer to accept, reject, or counter.",
      hi: "अच्छी खबर — {buyerName} ने आपके {cropName} लॉट के लिए {price} का ऑफर दिया है। स्वीकार, अस्वीकार या काउंटर करने के लिए ऑफर खोलें।",
      mr: "आनंदाची बातमी — {buyerName} यांनी तुमच्या {cropName} लॉटसाठी {price} ची ऑफर दिली आहे. स्वीकारण्यासाठी, नाकारण्यासाठी किंवा काउंटर करण्यासाठी ऑफर उघडा.",
    },
  },
  OFFER_ACCEPTED: {
    title: { en: "Offer accepted 🎉", hi: "ऑफर स्वीकार हुआ 🎉", mr: "ऑफर स्वीकारली 🎉" },
    body: {
      en: "Your offer for {cropName} was accepted at {price}. Next: arrange transport for the sale.",
      hi: "आपका {cropName} का ऑफर {price} पर स्वीकार कर लिया गया है। अगला कदम: बिक्री के लिए परिवहन तय करें।",
      mr: "तुमची {cropName} ची ऑफर {price} वर स्वीकारली गेली आहे. पुढील पायरी: विक्रीसाठी वाहतूक व्यवस्था करा.",
    },
  },
  OFFER_REJECTED: {
    title: { en: "Offer not accepted", hi: "ऑफर स्वीकार नहीं हुआ", mr: "ऑफर स्वीकारली नाही" },
    body: {
      en: "Your offer for {cropName} was not accepted this time.",
      hi: "आपका {cropName} का ऑफर इस बार स्वीकार नहीं हुआ।",
      mr: "तुमची {cropName} ची ऑफर यावेळी स्वीकारली गेली नाही.",
    },
  },
  OFFER_EXPIRED: {
    title: { en: "Offer expired", hi: "ऑफर समाप्त हुआ", mr: "ऑफरची मुदत संपली" },
    body: {
      en: "The offer for your {cropName} lot has expired.",
      hi: "आपके {cropName} लॉट का ऑफर समाप्त हो गया है।",
      mr: "तुमच्या {cropName} लॉटची ऑफर संपली आहे.",
    },
  },

  PAYMENT_PENDING: {
    title: { en: "Payment pending", hi: "भुगतान लंबित है", mr: "पेमेंट प्रलंबित आहे" },
    body: {
      en: "A payment of {amount} for your {cropName} sale is pending.",
      hi: "आपकी {cropName} बिक्री के लिए {amount} का भुगतान लंबित है।",
      mr: "तुमच्या {cropName} विक्रीसाठी {amount} चे पेमेंट प्रलंबित आहे.",
    },
  },
  PAYMENT_RECEIVED: {
    title: { en: "Payment received ✅", hi: "भुगतान प्राप्त हुआ ✅", mr: "पेमेंट मिळाले ✅" },
    body: {
      en: "Payment of {amount} has been marked as received. Thank you — this sale is now complete.",
      hi: "{amount} का भुगतान प्राप्त हुआ दर्ज किया गया है। धन्यवाद — यह बिक्री अब पूरी हो गई है।",
      mr: "{amount} चे पेमेंट मिळाले असे नोंदवले गेले आहे. धन्यवाद — ही विक्री आता पूर्ण झाली आहे.",
    },
  },
  PAYMENT_PARTIAL: {
    title: { en: "Partial payment received", hi: "आंशिक भुगतान प्राप्त हुआ", mr: "अंशतः पेमेंट मिळाले" },
    body: {
      en: "Partial payment of {amount} received. {amountDue} still due.",
      hi: "{amount} का आंशिक भुगतान प्राप्त हुआ। {amountDue} अभी बाकी है।",
      mr: "{amount} चे अंशतः पेमेंट मिळाले. {amountDue} अजून बाकी आहे.",
    },
  },
  PAYMENT_COMPLETED: {
    title: { en: "Payment completed", hi: "भुगतान पूरा हुआ", mr: "पेमेंट पूर्ण झाले" },
    body: {
      en: "Payment completed: {amount}.",
      hi: "भुगतान पूरा हुआ: {amount}।",
      mr: "पेमेंट पूर्ण झाले: {amount}.",
    },
  },
  PAYMENT_FAILED: {
    title: { en: "Payment failed", hi: "भुगतान विफल हुआ", mr: "पेमेंट अयशस्वी झाले" },
    body: {
      en: "Payment failed. Please review the payment status.",
      hi: "भुगतान विफल हो गया। कृपया भुगतान की स्थिति देखें।",
      mr: "पेमेंट अयशस्वी झाले. कृपया पेमेंट स्थिती तपासा.",
    },
  },

  SHIPMENT_CREATED: {
    title: { en: "Shipment created", hi: "शिपमेंट बनाई गई", mr: "शिपमेंट तयार झाली" },
    body: {
      en: "A shipment has been created for your {cropName} lot.",
      hi: "आपके {cropName} लॉट के लिए एक शिपमेंट बनाई गई है।",
      mr: "तुमच्या {cropName} लॉटसाठी शिपमेंट तयार झाली आहे.",
    },
  },
  TRANSPORTER_ASSIGNED: {
    title: { en: "Transporter assigned", hi: "ट्रांसपोर्टर नियुक्त हुआ", mr: "वाहतूकदार नियुक्त झाला" },
    body: {
      en: "{transporterName} has been assigned to transport your lot.",
      hi: "आपके लॉट को ले जाने के लिए {transporterName} नियुक्त किया गया है।",
      mr: "तुमचा लॉट नेण्यासाठी {transporterName} नियुक्त करण्यात आला आहे.",
    },
  },
  SHIPMENT_DISPATCHED: {
    title: { en: "Shipment dispatched", hi: "शिपमेंट रवाना हुई", mr: "शिपमेंट रवाना झाली" },
    body: {
      en: "Your shipment has been dispatched.",
      hi: "आपकी शिपमेंट रवाना हो गई है।",
      mr: "तुमची शिपमेंट रवाना झाली आहे.",
    },
  },
  SHIPMENT_IN_TRANSIT: {
    title: { en: "Shipment in transit", hi: "शिपमेंट रास्ते में है", mr: "शिपमेंट मार्गावर आहे" },
    body: {
      en: "Your shipment is on its way.",
      hi: "आपकी शिपमेंट रास्ते में है।",
      mr: "तुमची शिपमेंट मार्गावर आहे.",
    },
  },
  SHIPMENT_DELAYED: {
    title: { en: "Shipment delayed", hi: "शिपमेंट में देरी", mr: "शिपमेंटला विलंब" },
    body: {
      en: "Your shipment has been delayed. We'll keep you updated.",
      hi: "आपकी शिपमेंट में देरी हो गई है। हम आपको अपडेट करते रहेंगे।",
      mr: "तुमच्या शिपमेंटला विलंब झाला आहे. आम्ही तुम्हाला अपडेट करत राहू.",
    },
  },
  SHIPMENT_DELIVERED: {
    title: { en: "Shipment delivered ✅", hi: "शिपमेंट डिलीवर हुई ✅", mr: "शिपमेंट डिलिव्हर झाली ✅" },
    body: {
      en: "Your {cropName} shipment has been delivered. We'll notify you once the quality check and payment are confirmed.",
      hi: "आपकी {cropName} शिपमेंट डिलीवर हो गई है। क्वालिटी जांच और भुगतान की पुष्टि होते ही हम आपको सूचित करेंगे।",
      mr: "तुमची {cropName} शिपमेंट डिलिव्हर झाली आहे. गुणवत्ता तपासणी आणि पेमेंटची पुष्टी होताच आम्ही तुम्हाला कळवू.",
    },
  },

  QUALITY_CHECK_COMPLETED: {
    title: { en: "Quality check completed", hi: "क्वालिटी जांच पूरी हुई", mr: "गुणवत्ता तपासणी पूर्ण झाली" },
    body: {
      en: "The quality check for your {cropName} lot is complete.",
      hi: "आपके {cropName} लॉट की क्वालिटी जांच पूरी हो गई है।",
      mr: "तुमच्या {cropName} लॉटची गुणवत्ता तपासणी पूर्ण झाली आहे.",
    },
  },
  QUALITY_MISMATCH: {
    title: { en: "Quality mismatch found", hi: "क्वालिटी में अंतर मिला", mr: "गुणवत्तेत तफावत आढळली" },
    body: {
      en: "A quality mismatch was found on delivery of your {cropName} lot.",
      hi: "आपके {cropName} लॉट की डिलीवरी में क्वालिटी का अंतर पाया गया है।",
      mr: "तुमच्या {cropName} लॉटच्या डिलिव्हरीमध्ये गुणवत्तेत तफावत आढळली आहे.",
    },
  },
  DELIVERY_RECONCILIATION_COMPLETED: {
    title: { en: "Delivery reconciled", hi: "डिलीवरी का मिलान हुआ", mr: "डिलिव्हरीची पडताळणी झाली" },
    body: {
      en: "Delivery reconciliation for your {cropName} lot is complete.",
      hi: "आपके {cropName} लॉट की डिलीवरी मिलान पूरा हो गया है।",
      mr: "तुमच्या {cropName} लॉटची डिलिव्हरी पडताळणी पूर्ण झाली आहे.",
    },
  },

  DISPUTE_CREATED: {
    title: { en: "Dispute submitted", hi: "शिकायत दर्ज हुई", mr: "तक्रार नोंदवली" },
    body: {
      en: "Your dispute {disputeNumber} has been submitted.",
      hi: "आपकी शिकायत {disputeNumber} दर्ज कर ली गई है।",
      mr: "तुमची तक्रार {disputeNumber} नोंदवली गेली आहे.",
    },
  },
  DISPUTE_RESPONSE_REQUIRED: {
    title: { en: "Response required", hi: "जवाब आवश्यक है", mr: "प्रतिसाद आवश्यक आहे" },
    body: {
      en: "Additional information is required for dispute {disputeNumber}.",
      hi: "शिकायत {disputeNumber} के लिए अतिरिक्त जानकारी आवश्यक है।",
      mr: "तक्रार {disputeNumber} साठी अतिरिक्त माहिती आवश्यक आहे.",
    },
  },
  DISPUTE_UPDATED: {
    title: { en: "Dispute updated", hi: "शिकायत अपडेट हुई", mr: "तक्रार अद्ययावत झाली" },
    body: {
      en: "There is an update on your dispute {disputeNumber}.",
      hi: "आपकी शिकायत {disputeNumber} पर एक अपडेट है।",
      mr: "तुमच्या तक्रार {disputeNumber} वर एक अद्यतन आहे.",
    },
  },
  DISPUTE_RESOLVED: {
    title: { en: "Dispute resolved", hi: "शिकायत का समाधान हुआ", mr: "तक्रारीचे निराकरण झाले" },
    body: {
      en: "Your dispute {disputeNumber} has been resolved.",
      hi: "आपकी शिकायत {disputeNumber} का समाधान कर दिया गया है।",
      mr: "तुमच्या तक्रार {disputeNumber} चे निराकरण झाले आहे.",
    },
  },
  DISPUTE_REJECTED: {
    title: { en: "Dispute rejected", hi: "शिकायत अस्वीकार हुई", mr: "तक्रार नाकारली" },
    body: {
      en: "Your dispute {disputeNumber} was not upheld.",
      hi: "आपकी शिकायत {disputeNumber} स्वीकार नहीं की गई।",
      mr: "तुमची तक्रार {disputeNumber} मान्य केली गेली नाही.",
    },
  },
  DISPUTE_REOPENED: {
    title: { en: "Dispute reopened", hi: "शिकायत फिर से खोली गई", mr: "तक्रार पुन्हा उघडली" },
    body: {
      en: "Your dispute {disputeNumber} has been reopened.",
      hi: "आपकी शिकायत {disputeNumber} फिर से खोली गई है।",
      mr: "तुमची तक्रार {disputeNumber} पुन्हा उघडण्यात आली आहे.",
    },
  },
  DISPUTE_CLOSED: {
    title: { en: "Dispute closed", hi: "शिकायत बंद हुई", mr: "तक्रार बंद झाली" },
    body: {
      en: "Your dispute {disputeNumber} has been closed.",
      hi: "आपकी शिकायत {disputeNumber} बंद कर दी गई है।",
      mr: "तुमची तक्रार {disputeNumber} बंद करण्यात आली आहे.",
    },
  },

  LOGISTICS_QUOTE_RECEIVED: {
    title: { en: "New logistics quote", hi: "नया परिवहन कोटेशन", mr: "नवीन वाहतूक कोटेशन" },
    body: {
      en: "A new transport quote of {amount} is available for your shipment.",
      hi: "आपकी शिपमेंट के लिए {amount} का नया परिवहन कोटेशन उपलब्ध है।",
      mr: "तुमच्या शिपमेंटसाठी {amount} चे नवीन वाहतूक कोटेशन उपलब्ध आहे.",
    },
  },
  LOGISTICS_QUOTE_EXPIRED: {
    title: { en: "Logistics quote expired", hi: "परिवहन कोटेशन समाप्त हुआ", mr: "वाहतूक कोटेशन संपले" },
    body: {
      en: "A transport quote for your shipment has expired.",
      hi: "आपकी शिपमेंट के लिए परिवहन कोटेशन समाप्त हो गया है।",
      mr: "तुमच्या शिपमेंटसाठी वाहतूक कोटेशन संपले आहे.",
    },
  },

  MARKET_PRICE_ALERT: {
    title: { en: "Mandi price update", hi: "मंडी भाव अपडेट", mr: "मंडी भाव अद्यतन" },
    body: {
      en: "{cropName} mandi price has moved to {price}.",
      hi: "{cropName} का मंडी भाव {price} हो गया है।",
      mr: "{cropName} चा मंडी भाव {price} झाला आहे.",
    },
  },
  MARKET_TREND_ALERT: {
    title: { en: "Market trend update", hi: "बाजार रुझान अपडेट", mr: "बाजार कल अद्यतन" },
    body: {
      en: "{cropName} prices have {trend} over the last {days} days.",
      hi: "पिछले {days} दिनों में {cropName} के भाव {trend} हैं।",
      mr: "गेल्या {days} दिवसांत {cropName} चे भाव {trend} आहेत.",
    },
  },
  FORECAST_ALERT: {
    title: { en: "Price forecast", hi: "मूल्य पूर्वानुमान", mr: "किंमत अंदाज" },
    body: {
      en: "Anndata's forecast indicates a possible {trend} in {cropName} prices over the next {days} days. This is a forecast, not a guarantee.",
      hi: "Anndata के पूर्वानुमान के अनुसार अगले {days} दिनों में {cropName} के भाव में {trend} संभव है। यह एक पूर्वानुमान है, गारंटी नहीं।",
      mr: "Anndata च्या अंदाजानुसार पुढील {days} दिवसांत {cropName} च्या भावात {trend} शक्य आहे. हा फक्त अंदाज आहे, हमी नाही.",
    },
  },

  LOT_CREATED: {
    title: { en: "Lot created", hi: "लॉट बनाया गया", mr: "लॉट तयार झाला" },
    body: {
      en: "Your {cropName} lot has been created.",
      hi: "आपका {cropName} लॉट बनाया गया है।",
      mr: "तुमचा {cropName} लॉट तयार झाला आहे.",
    },
  },
  LOT_UPDATED: {
    title: { en: "Lot updated", hi: "लॉट अपडेट हुआ", mr: "लॉट अद्ययावत झाला" },
    body: {
      en: "Your {cropName} lot has been updated.",
      hi: "आपका {cropName} लॉट अपडेट हो गया है।",
      mr: "तुमचा {cropName} लॉट अद्ययावत झाला आहे.",
    },
  },
  LOT_STATUS_CHANGED: {
    title: { en: "Lot status changed", hi: "लॉट की स्थिति बदली", mr: "लॉटची स्थिती बदलली" },
    body: {
      en: "Your {cropName} lot is now {status}.",
      hi: "आपका {cropName} लॉट अब {status} है।",
      mr: "तुमचा {cropName} लॉट आता {status} आहे.",
    },
  },

  ACCOUNT_SECURITY_ALERT: {
    title: { en: "Security alert", hi: "सुरक्षा चेतावनी", mr: "सुरक्षा इशारा" },
    body: {
      en: "A security-related change was made to your account. If this wasn't you, contact support immediately.",
      hi: "आपके खाते में एक सुरक्षा-संबंधित बदलाव किया गया है। अगर यह आपने नहीं किया, तो तुरंत सहायता से संपर्क करें।",
      mr: "तुमच्या खात्यात सुरक्षा-संबंधित बदल करण्यात आला आहे. हे तुम्ही केले नसल्यास, त्वरित सहाय्याशी संपर्क साधा.",
    },
  },
  PASSWORD_CHANGED: {
    title: { en: "Password changed", hi: "पासवर्ड बदला गया", mr: "पासवर्ड बदलला" },
    body: {
      en: "Your account password was changed. If this wasn't you, contact support immediately.",
      hi: "आपके खाते का पासवर्ड बदल दिया गया है। अगर यह आपने नहीं किया, तो तुरंत सहायता से संपर्क करें।",
      mr: "तुमच्या खात्याचा पासवर्ड बदलण्यात आला आहे. हे तुम्ही केले नसल्यास, त्वरित सहाय्याशी संपर्क साधा.",
    },
  },
  LOGIN_ALERT: {
    title: { en: "New login detected", hi: "नया लॉगिन मिला", mr: "नवीन लॉगिन आढळले" },
    body: {
      en: "A new login to your account was detected.",
      hi: "आपके खाते में एक नया लॉगिन हुआ है।",
      mr: "तुमच्या खात्यात नवीन लॉगिन झाले आहे.",
    },
  },

  SYSTEM_ANNOUNCEMENT: {
    title: { en: "{title}", hi: "{title}", mr: "{title}" },
    body: {
      en: "{message}",
      hi: "{message}",
      mr: "{message}",
    },
  },
};

/** Renders both the title and body for a given type/language/vars in one
 * call — the only entry point notification.service.ts's template-rendering
 * step needs. */
export function renderNotificationTemplate(
  type: NotificationType,
  lang: Language,
  vars: TemplateVars,
): { title: string; body: string } {
  const template = TEMPLATES[type];
  return {
    title: renderEntry(template.title, lang, vars),
    body: renderEntry(template.body, lang, vars),
  };
}

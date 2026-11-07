/**
 * Notification templates, in the four languages of the app.
 *
 * A notification is stored with its template key and its values (amount,
 * period, title…); it is rendered in the reader's language when listed and
 * when pushed. Its link opens the screen it is about — given only to roles
 * that may open that screen (the screen and the API check again).
 * Alerts written before templates existed have no key: their stored French
 * text is shown as before.
 */
export type Lang = "fr" | "en" | "ar" | "es";
type Text4 = Record<Lang, string>;
interface Template {
  title: Text4;
  message: Text4;
  /** App route; {name} is replaced by the value of that parameter. */
  link?: string;
  /** Roles allowed to follow the link; omitted = everyone the alert reaches. */
  roles?: readonly string[];
}

const FINANCE = ["syndicate_admin", "treasurer", "president", "committee_member"] as const;
const GOVERNANCE = ["syndicate_admin", "president", "secretary", "committee_member"] as const;
const TEAM = ["syndicate_admin", "president", "treasurer", "secretary", "committee_member"] as const;
const SYNDIC = ["super_admin", "syndicate_admin"] as const;
const PLATFORM = ["super_admin"] as const;

export const NOTIFICATIONS = {
  // ── Calls for funds and payments ──
  "fundsCall.new": {
    title: { fr: "Nouvel appel de fonds", en: "New call for funds", ar: "نداء أموال جديد", es: "Nueva derrama" },
    message: {
      fr: "Appel de fonds {period} : {amount} MAD à régler avant le {dueDate}.",
      en: "Call for funds {period}: {amount} MAD due by {dueDate}.",
      ar: "نداء الأموال {period}: {amount} درهم يجب أداؤها قبل {dueDate}.",
      es: "Derrama {period}: {amount} MAD a pagar antes del {dueDate}.",
    },
    link: "/charges",
  },
  "payment.toValidate": {
    title: { fr: "Paiement à valider", en: "Payment to validate", ar: "أداء في انتظار المصادقة", es: "Pago por validar" },
    message: {
      fr: "Un paiement de {amount} MAD (appel {period}) a été déclaré et attend votre validation.",
      en: "A payment of {amount} MAD (call {period}) was declared and awaits your validation.",
      ar: "تم التصريح بأداء قدره {amount} درهم (النداء {period}) وهو في انتظار مصادقتكم.",
      es: "Se ha declarado un pago de {amount} MAD (derrama {period}) que espera su validación.",
    },
    link: "/paiements",
    roles: FINANCE,
  },
  "payment.validated": {
    title: { fr: "Paiement validé", en: "Payment validated", ar: "تمت المصادقة على الأداء", es: "Pago validado" },
    message: {
      fr: "Votre paiement de {amount} MAD (appel {period}) est validé. Reçu n° {receipt}.",
      en: "Your payment of {amount} MAD (call {period}) is validated. Receipt no. {receipt}.",
      ar: "تمت المصادقة على أدائكم البالغ {amount} درهم (النداء {period}). وصل رقم {receipt}.",
      es: "Su pago de {amount} MAD (derrama {period}) está validado. Recibo n.º {receipt}.",
    },
    link: "/charges",
  },
  "payment.validatedPartial": {
    title: { fr: "Paiement validé", en: "Payment validated", ar: "تمت المصادقة على الأداء", es: "Pago validado" },
    message: {
      fr: "Votre paiement de {amount} MAD (appel {period}) est validé. Reçu n° {receipt}. Reste à payer : {remaining} MAD.",
      en: "Your payment of {amount} MAD (call {period}) is validated. Receipt no. {receipt}. Still due: {remaining} MAD.",
      ar: "تمت المصادقة على أدائكم البالغ {amount} درهم (النداء {period}). وصل رقم {receipt}. المتبقي: {remaining} درهم.",
      es: "Su pago de {amount} MAD (derrama {period}) está validado. Recibo n.º {receipt}. Pendiente: {remaining} MAD.",
    },
    link: "/charges",
  },
  "payment.rejected": {
    title: { fr: "Paiement refusé", en: "Payment rejected", ar: "تم رفض الأداء", es: "Pago rechazado" },
    message: {
      fr: "Votre paiement pour l'appel {period} a été refusé : {reason}. Vous pouvez le déclarer à nouveau.",
      en: "Your payment for call {period} was rejected: {reason}. You can declare it again.",
      ar: "تم رفض أدائكم الخاص بالنداء {period}: {reason}. يمكنكم التصريح به من جديد.",
      es: "Su pago de la derrama {period} ha sido rechazado: {reason}. Puede declararlo de nuevo.",
    },
    link: "/charges",
  },
  "payment.cancelled": {
    title: { fr: "Paiement annulé", en: "Payment cancelled", ar: "تم إلغاء الأداء", es: "Pago anulado" },
    message: {
      fr: "Votre paiement de {amount} MAD (appel {period}) a été annulé : {reason}.",
      en: "Your payment of {amount} MAD (call {period}) was cancelled: {reason}.",
      ar: "تم إلغاء أدائكم البالغ {amount} درهم (النداء {period}): {reason}.",
      es: "Su pago de {amount} MAD (derrama {period}) ha sido anulado: {reason}.",
    },
    link: "/charges",
  },
  "payment.refunded": {
    title: { fr: "Paiement remboursé", en: "Payment refunded", ar: "تم استرجاع الأداء", es: "Pago reembolsado" },
    message: {
      fr: "Votre paiement de {amount} MAD (appel {period}) a été remboursé : {reason}.",
      en: "Your payment of {amount} MAD (call {period}) was refunded: {reason}.",
      ar: "تم إرجاع أدائكم البالغ {amount} درهم (النداء {period}): {reason}.",
      es: "Su pago de {amount} MAD (derrama {period}) ha sido reembolsado: {reason}.",
    },
    link: "/charges",
  },
  "expense.toApprove": {
    title: { fr: "Dépense à approuver", en: "Expense to approve", ar: "نفقة في انتظار المصادقة", es: "Gasto por aprobar" },
    message: {
      fr: "{reference} : {label} ({amount} MAD) attend une approbation.",
      en: "{reference}: {label} ({amount} MAD) awaits approval.",
      ar: "{reference}: {label} ({amount} درهم) في انتظار المصادقة.",
      es: "{reference}: {label} ({amount} MAD) espera aprobación.",
    },
    link: "/tresorerie?tab=expenses",
    roles: FINANCE,
  },
  "debt.escalation": {
    title: { fr: "Nouvelle escalade de recouvrement — {level}", en: "New debt-recovery escalation — {level}", ar: "تصعيد جديد في التحصيل — {level}", es: "Nueva escalada de cobro — {level}" },
    message: {
      fr: "Un dossier de recouvrement au niveau « {level} » a été ouvert. Consultez le tableau Recouvrement.",
      en: "A recovery case at level « {level} » was opened. See the Recovery board.",
      ar: "فُتح ملف تحصيل في مستوى «{level}». راجعوا لوحة التحصيل.",
      es: "Se ha abierto un expediente de cobro de nivel «{level}». Consulte el panel de cobro.",
    },
    link: "/escalation",
    roles: SYNDIC,
  },

  // ── Support tickets ──
  "ticket.new": {
    title: { fr: "Nouveau ticket support", en: "New support ticket", ar: "تذكرة دعم جديدة", es: "Nuevo ticket de soporte" },
    message: { fr: "« {title} » de {author} ({priority}).", en: "« {title} » from {author} ({priority}).", ar: "«{title}» من {author} ({priority}).", es: "«{title}» de {author} ({priority})." },
    link: "/support",
  },
  "ticket.platformNew": {
    title: { fr: "Nouveau ticket plateforme", en: "New platform ticket", ar: "تذكرة منصة جديدة", es: "Nuevo ticket de plataforma" },
    message: { fr: "« {title} » de {author} ({priority}).", en: "« {title} » from {author} ({priority}).", ar: "«{title}» من {author} ({priority}).", es: "«{title}» de {author} ({priority})." },
    link: "/platform-support",
    roles: PLATFORM,
  },
  "ticket.reply": {
    title: { fr: "Réponse à votre ticket", en: "Reply to your ticket", ar: "رد على تذكرتكم", es: "Respuesta a su ticket" },
    message: { fr: "{author} a répondu à « {title} ».", en: "{author} replied to « {title} ».", ar: "ردّ {author} على «{title}».", es: "{author} ha respondido a «{title}»." },
    link: "/support",
  },
  "ticket.userMessage": {
    title: { fr: "Nouveau message sur un ticket", en: "New message on a ticket", ar: "رسالة جديدة في تذكرة", es: "Nuevo mensaje en un ticket" },
    message: { fr: "{author} a complété le ticket « {title} ».", en: "{author} added to the ticket « {title} ».", ar: "أضاف {author} معلومات إلى التذكرة «{title}».", es: "{author} ha completado el ticket «{title}»." },
    link: "/support",
  },
  "ticket.resolved": {
    title: { fr: "Ticket résolu", en: "Ticket resolved", ar: "تمت معالجة التذكرة", es: "Ticket resuelto" },
    message: { fr: "Votre ticket « {title} » a été marqué comme résolu.", en: "Your ticket « {title} » was marked as resolved.", ar: "تم تحديد تذكرتكم «{title}» كمعالجة.", es: "Su ticket «{title}» se ha marcado como resuelto." },
    link: "/support",
  },
  "ticket.escalated": {
    title: { fr: "Ticket escaladé vers la plateforme", en: "Ticket escalated to the platform", ar: "تذكرة محالة إلى المنصة", es: "Ticket escalado a la plataforma" },
    message: { fr: "« {title} » a été escaladé par {author}.", en: "« {title} » was escalated by {author}.", ar: "أحال {author} التذكرة «{title}».", es: "{author} ha escalado «{title}»." },
    link: "/platform-support",
    roles: PLATFORM,
  },

  // ── Documents ──
  "document.requested": {
    title: { fr: "Nouvelle demande de document", en: "New document request", ar: "طلب وثيقة جديد", es: "Nueva solicitud de documento" },
    message: { fr: "{member} a demandé : « {title} ».", en: "{member} requested: « {title} ».", ar: "طلب {member}: «{title}».", es: "{member} ha solicitado: «{title}»." },
    link: "/documents",
    roles: TEAM,
  },
  "document.recoveryPack": {
    title: { fr: "Dossier de recouvrement généré", en: "Recovery file generated", ar: "تم إنشاء ملف التحصيل", es: "Expediente de cobro generado" },
    message: { fr: "{count} documents créés pour {member}.", en: "{count} documents created for {member}.", ar: "تم إنشاء {count} وثيقة لـ {member}.", es: "{count} documentos creados para {member}." },
    link: "/documents",
    roles: TEAM,
  },
  "document.agPack": {
    title: { fr: "Dossier AG généré", en: "General meeting file generated", ar: "تم إنشاء ملف الجمع العام", es: "Expediente de junta generado" },
    message: { fr: "{count} documents pour {meeting}.", en: "{count} documents for {meeting}.", ar: "{count} وثيقة لـ {meeting}.", es: "{count} documentos para {meeting}." },
    link: "/documents",
    roles: TEAM,
  },
  "document.generated": {
    title: { fr: "Nouveau document généré", en: "New document generated", ar: "تم إنشاء وثيقة جديدة", es: "Nuevo documento generado" },
    message: { fr: "« {title} » a été généré ({category}).", en: "« {title} » was generated ({category}).", ar: "تم إنشاء «{title}» ({category}).", es: "Se ha generado «{title}» ({category})." },
    link: "/documents",
    roles: TEAM,
  },
  "document.available": {
    title: { fr: "Votre document est disponible", en: "Your document is available", ar: "وثيقتكم متوفرة", es: "Su documento está disponible" },
    message: { fr: "« {title} » est disponible dans votre espace Documents.", en: "« {title} » is available in your Documents.", ar: "«{title}» متوفرة في فضاء الوثائق الخاص بكم.", es: "«{title}» está disponible en sus Documentos." },
    link: "/documents",
  },
  "document.published": {
    title: { fr: "Nouveau document publié", en: "New document published", ar: "تم نشر وثيقة جديدة", es: "Nuevo documento publicado" },
    message: { fr: "« {title} » est disponible dans l'espace Documents.", en: "« {title} » is available in Documents.", ar: "«{title}» متوفرة في فضاء الوثائق.", es: "«{title}» está disponible en Documentos." },
    link: "/documents",
  },
  "document.approved": {
    title: { fr: "Document approuvé", en: "Document approved", ar: "تمت المصادقة على الوثيقة", es: "Documento aprobado" },
    message: { fr: "« {title} » a été approuvé.", en: "« {title} » was approved.", ar: "تمت المصادقة على «{title}».", es: "«{title}» ha sido aprobado." },
    link: "/documents",
  },
  "document.rejected": {
    title: { fr: "Document rejeté", en: "Document rejected", ar: "تم رفض الوثيقة", es: "Documento rechazado" },
    message: { fr: "« {title} » a été rejeté. Motif : {reason}", en: "« {title} » was rejected. Reason: {reason}", ar: "تم رفض «{title}». السبب: {reason}", es: "«{title}» ha sido rechazado. Motivo: {reason}" },
    link: "/documents",
  },
  "document.signed": {
    title: { fr: "Document signé", en: "Document signed", ar: "تم توقيع الوثيقة", es: "Documento firmado" },
    message: { fr: "« {title} » a été signé électroniquement par {signer}.", en: "« {title} » was signed electronically by {signer}.", ar: "وقّع {signer} إلكترونيًا على «{title}».", es: "{signer} ha firmado electrónicamente «{title}»." },
    link: "/documents",
    roles: TEAM,
  },
  "document.expiring": {
    title: { fr: "Document bientôt expiré", en: "Document expiring soon", ar: "وثيقة على وشك الانتهاء", es: "Documento a punto de caducar" },
    message: { fr: "{message}", en: "{message}", ar: "{message}", es: "{message}" },
    link: "/documents",
    roles: TEAM,
  },
  "document.retention": {
    title: { fr: "Documents approchant la fin de conservation légale", en: "Documents nearing the end of legal retention", ar: "وثائق تقترب من نهاية مدة الحفظ القانونية", es: "Documentos cerca del fin de la conservación legal" },
    message: { fr: "{count} document(s) atteindront leur date limite de conservation dans les 30 prochains jours.", en: "{count} document(s) will reach their retention limit within 30 days.", ar: "ستبلغ {count} وثيقة أجل الحفظ خلال 30 يومًا.", es: "{count} documento(s) alcanzarán su plazo de conservación en los próximos 30 días." },
    link: "/documents",
    roles: TEAM,
  },

  // ── Elections and mandates ──
  "election.results": {
    title: { fr: "Résultats publiés", en: "Results published", ar: "تم نشر النتائج", es: "Resultados publicados" },
    message: { fr: "Les résultats de « {title} » sont disponibles.", en: "The results of « {title} » are available.", ar: "نتائج «{title}» متوفرة.", es: "Los resultados de «{title}» están disponibles." },
    link: "/elections",
  },
  "election.announced": {
    title: { fr: "Élection annoncée", en: "Election announced", ar: "تم الإعلان عن انتخابات", es: "Elección anunciada" },
    message: { fr: "Candidatures ouvertes pour « {title} ».", en: "Candidacies open for « {title} ».", ar: "باب الترشيح مفتوح لـ «{title}».", es: "Candidaturas abiertas para «{title}»." },
    link: "/elections",
  },
  "election.voteOpen": {
    title: { fr: "Vote ouvert", en: "Voting open", ar: "التصويت مفتوح", es: "Votación abierta" },
    message: { fr: "Le vote pour « {title} » est ouvert.", en: "Voting for « {title} » is open.", ar: "التصويت على «{title}» مفتوح.", es: "La votación de «{title}» está abierta." },
    link: "/elections",
  },
  "election.closingSoon": {
    title: { fr: "Le vote se termine bientôt", en: "Voting closes soon", ar: "التصويت ينتهي قريبًا", es: "La votación termina pronto" },
    message: {
      fr: "Le vote pour « {title} » se termine dans {days} jour(s) ({pending}/{eligible} n'ont pas encore voté).",
      en: "Voting for « {title} » ends in {days} day(s) ({pending}/{eligible} have not voted yet).",
      ar: "ينتهي التصويت على «{title}» بعد {days} يوم ({pending}/{eligible} لم يصوّتوا بعد).",
      es: "La votación de «{title}» termina en {days} día(s) ({pending}/{eligible} aún no han votado).",
    },
    link: "/elections",
  },
  "mandate.resigned": {
    title: { fr: "Démission", en: "Resignation", ar: "استقالة", es: "Dimisión" },
    message: { fr: "{name} ({role}) a démissionné de son mandat.", en: "{name} ({role}) resigned from their mandate.", ar: "استقال {name} ({role}) من مهامه.", es: "{name} ({role}) ha dimitido de su mandato." },
    link: "/governance",
    roles: GOVERNANCE,
  },
  // Organizational structure (committees: internal bodies, no legal power).
  "org.structureActivated": {
    title: { fr: "Organisation de la copropriété", en: "Organization of the condominium", ar: "تنظيم الملكية المشتركة", es: "Organización de la comunidad" },
    message: { fr: "L'organisation de la copropriété a été mise à jour (version {version}).", en: "The organization of the condominium was updated (version {version}).", ar: "تم تحديث تنظيم الملكية المشتركة (الإصدار {version}).", es: "La organización de la comunidad se ha actualizado (versión {version})." },
    link: "/organization",
  },
  "org.assigned": {
    title: { fr: "Nouvelle fonction", en: "New position", ar: "مهمة جديدة", es: "Nueva función" },
    message: { fr: "Vous êtes désigné(e) « {position} » — {component}.", en: "You are appointed « {position} » — {component}.", ar: "تم تعيينك «{position}» — {component}.", es: "Ha sido designado/a «{position}» — {component}." },
    link: "/organization",
  },
  "org.assignmentEnded": {
    title: { fr: "Fin de fonction", en: "Position ended", ar: "انتهاء المهمة", es: "Fin de función" },
    message: { fr: "Votre fonction « {position} » — {component} a pris fin.", en: "Your position « {position} » — {component} has ended.", ar: "انتهت مهمتك «{position}» — {component}.", es: "Su función «{position}» — {component} ha terminado." },
    link: "/organization",
  },
  "org.componentClosed": {
    title: { fr: "Comité clos", en: "Committee closed", ar: "إغلاق اللجنة", es: "Comité cerrado" },
    message: { fr: "« {component} » a été clos. Son historique est conservé.", en: "« {component} » was closed. Its history is kept.", ar: "تم إغلاق «{component}». تم الاحتفاظ بسجله.", es: "« {component} » se ha cerrado. Su historial se conserva." },
    link: "/organization",
  },
  "org.recommendation": {
    title: { fr: "Recommandation d'un comité", en: "Committee recommendation", ar: "توصية من لجنة", es: "Recomendación de un comité" },
    message: { fr: "{component} vous adresse une recommandation : « {title} ». La décision vous revient.", en: "{component} sends you a recommendation: « {title} ». The decision is yours.", ar: "توجه إليك {component} توصية: «{title}». القرار لك.", es: "{component} le envía una recomendación: «{title}». La decisión es suya." },
    link: "/organization",
    roles: SYNDIC,
  },
  // Official resignations (Loi 18-00, art. 26 ter, 27, 27 ter): every co-owner is informed.
  "resignation.syndic": {
    title: { fr: "Démission du syndic", en: "The syndic has resigned", ar: "استقالة السنديك", es: "Dimisión del administrador" },
    message: {
      fr: "{name} a démissionné de la fonction de syndic. Une assemblée générale doit se tenir avant le {deadline} pour désigner un nouveau syndic. Le syndic adjoint exerce ses attributions entre-temps.",
      en: "{name} resigned as syndic. A general assembly must be held before {deadline} to designate a new syndic. The deputy syndic acts as syndic meanwhile.",
      ar: "استقال {name} من مهام السنديك. يجب عقد جمع عام قبل {deadline} لتعيين سنديك جديد. يمارس نائب السنديك مهامه في الأثناء.",
      es: "{name} ha dimitido como administrador. Debe celebrarse una asamblea general antes del {deadline} para designar un nuevo administrador. El administrador adjunto ejerce sus funciones mientras tanto.",
    },
    link: "/resignations",
  },
  "resignation.syndicNoDeputy": {
    title: { fr: "Démission du syndic", en: "The syndic has resigned", ar: "استقالة السنديك", es: "Dimisión del administrador" },
    message: {
      fr: "{name} a démissionné de la fonction de syndic. Une assemblée générale doit se tenir avant le {deadline}. Aucun syndic adjoint n'est en fonction pour assurer l'intérim.",
      en: "{name} resigned as syndic. A general assembly must be held before {deadline}. No deputy syndic is in office to act meanwhile.",
      ar: "استقال {name} من مهام السنديك. يجب عقد جمع عام قبل {deadline}. لا يوجد نائب للسنديك لتولي المهام في الأثناء.",
      es: "{name} ha dimitido como administrador. Debe celebrarse una asamblea general antes del {deadline}. Ningún administrador adjunto está en funciones para sustituirle.",
    },
    link: "/resignations",
  },
  "resignation.viceSyndic": {
    title: { fr: "Démission du syndic adjoint", en: "The deputy syndic has resigned", ar: "استقالة نائب السنديك", es: "Dimisión del administrador adjunto" },
    message: {
      fr: "{name} a démissionné de la fonction de syndic adjoint. Le syndic doit convoquer une assemblée générale avant le {deadline} pour désigner un nouvel adjoint.",
      en: "{name} resigned as deputy syndic. The syndic must call a general assembly before {deadline} to designate a new deputy.",
      ar: "استقال {name} من مهام نائب السنديك. يجب على السنديك دعوة جمع عام قبل {deadline} لتعيين نائب جديد.",
      es: "{name} ha dimitido como administrador adjunto. El administrador debe convocar una asamblea general antes del {deadline} para designar un nuevo adjunto.",
    },
    link: "/resignations",
  },
  "mandate.revoked": {
    title: { fr: "Révocation de mandat", en: "Mandate revoked", ar: "إلغاء التفويض", es: "Revocación de mandato" },
    message: { fr: "{name} ({role}) a été révoqué(e) de son mandat.", en: "{name} ({role}) was removed from their mandate.", ar: "تم إعفاء {name} ({role}) من مهامه.", es: "{name} ({role}) ha sido revocado/a de su mandato." },
    link: "/governance",
    roles: GOVERNANCE,
  },
  "mandate.expired": {
    title: { fr: "Mandat expiré", en: "Mandate expired", ar: "انتهاء التفويض", es: "Mandato vencido" },
    message: { fr: "Le mandat de {name} ({role}) est arrivé à échéance — une nouvelle élection peut être nécessaire.", en: "The mandate of {name} ({role}) has ended — a new election may be needed.", ar: "انتهت مدة مهام {name} ({role}) — قد يلزم تنظيم انتخابات جديدة.", es: "El mandato de {name} ({role}) ha vencido; puede ser necesaria una nueva elección." },
    link: "/governance",
    roles: GOVERNANCE,
  },

  // ── Residence life ──
  "member.joined": {
    title: { fr: "Nouveau membre", en: "New member", ar: "عضو جديد", es: "Nuevo miembro" },
    message: { fr: "{name} vient de rejoindre la copropriété.", en: "{name} has joined the condominium.", ar: "انضم {name} إلى الإقامة.", es: "{name} se ha unido a la comunidad." },
    link: "/members",
    roles: TEAM,
  },
  "parking.report": {
    title: { fr: "Infraction de stationnement : {plate}", en: "Parking offence: {plate}", ar: "مخالفة توقف: {plate}", es: "Infracción de aparcamiento: {plate}" },
    message: { fr: "Signalé par {author}{notes}", en: "Reported by {author}{notes}", ar: "أبلغ عنها {author}{notes}", es: "Señalado por {author}{notes}" },
    link: "/parking",
    roles: TEAM,
  },
  "claim.declared": {
    title: { fr: "Sinistre déclaré : {type}", en: "Claim declared: {type}", ar: "تم التصريح بحادث: {type}", es: "Siniestro declarado: {type}" },
    message: { fr: "{description}", en: "{description}", ar: "{description}", es: "{description}" },
    link: "/sinistres",
  },
  "works.priority": {
    title: { fr: "Travaux prioritaires : {title}", en: "Priority works: {title}", ar: "أشغال ذات أولوية: {title}", es: "Obras prioritarias: {title}" },
    message: { fr: "{description}", en: "{description}", ar: "{description}", es: "{description}" },
    link: "/travaux",
  },
  "works.urgent": {
    title: { fr: "Travaux URGENTS : {title}", en: "URGENT works: {title}", ar: "أشغال مستعجلة: {title}", es: "Obras URGENTES: {title}" },
    message: { fr: "{description}", en: "{description}", ar: "{description}", es: "{description}" },
    link: "/travaux",
  },
  "contract.expiring": {
    title: { fr: "Contrat expirant dans {days} jours", en: "Contract expiring in {days} days", ar: "عقد ينتهي بعد {days} يومًا", es: "Contrato que vence en {days} días" },
    message: { fr: "Le contrat « {title} » avec {provider} expire le {endDate}. Pensez à le renouveler.", en: "The contract « {title} » with {provider} ends on {endDate}. Remember to renew it.", ar: "ينتهي العقد «{title}» مع {provider} في {endDate}. فكّروا في تجديده.", es: "El contrato «{title}» con {provider} vence el {endDate}. Recuerde renovarlo." },
    link: "/prestataires",
    roles: TEAM,
  },
  "subscription.expiring": {
    title: { fr: "Abonnement : expiration dans {days} jour(s)", en: "Subscription: expires in {days} day(s)", ar: "الاشتراك: ينتهي بعد {days} يوم", es: "Suscripción: caduca en {days} día(s)" },
    message: { fr: "Renouvelez votre abonnement pour garder l'accès complet à MIZAN. Après expiration : lecture seule.", en: "Renew your subscription to keep full access to MIZAN. After it expires: read-only.", ar: "جدّدوا اشتراككم للحفاظ على الولوج الكامل إلى MIZAN. بعد انتهائه: القراءة فقط.", es: "Renueve su suscripción para mantener el acceso completo a MIZAN. Tras caducar: solo lectura." },
    link: "/abonnements",
    roles: SYNDIC,
  },
} satisfies Record<string, Template>;

export type NotificationKey = keyof typeof NOTIFICATIONS;
export type NotificationParams = Record<string, string | number | null | undefined>;

const LANGS: readonly Lang[] = ["fr", "en", "ar", "es"];
export const asLang = (v: unknown): Lang => (LANGS.includes(v as Lang) ? (v as Lang) : "fr");

/** Values keep their own direction inside Arabic text (amounts, periods, references). */
const LOCALES: Record<Lang, string> = { fr: "fr-FR", en: "en-GB", ar: "ar-MA", es: "es-ES" };
/** A date parameter (YYYY-MM-DD) written in the reader's language: « 7 décembre 2026 ». */
function localDate(s: string, lang: Lang) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  try {
    return new Date(`${s}T12:00:00Z`).toLocaleDateString(LOCALES[lang], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  } catch {
    return s;
  }
}

function fill(template: string, params: NotificationParams, lang: Lang) {
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = params[name];
    const s = v === null || v === undefined ? "" : localDate(String(v), lang);
    return lang === "ar" && s ? `⁨${s}⁩` : s;
  });
}

export function renderNotification(key: string | null | undefined, params: NotificationParams | null | undefined, lang: Lang) {
  const t = key ? (NOTIFICATIONS as Record<string, Template>)[key] : undefined;
  if (!t) return null;
  const p = params ?? {};
  return { title: fill(t.title[lang], p, lang), message: fill(t.message[lang], p, lang) };
}

/** The link of a notification, if this role may open the screen it points to. */
export function notificationLink(key: string | null | undefined, storedLink: string | null | undefined, role: string): string | null {
  const t = key ? (NOTIFICATIONS as Record<string, Template>)[key] : undefined;
  const link = storedLink ?? t?.link ?? null;
  if (!link) return null;
  if (t?.roles && role !== "super_admin" && !t.roles.includes(role)) return null;
  if (t?.roles && role === "super_admin" && !t.roles.includes("super_admin")) return null;
  return link;
}

/** The stored copy of a notification: the French text, kept for old clients. */
export function frenchCopy(key: NotificationKey, params: NotificationParams) {
  return renderNotification(key, params, "fr")!;
}

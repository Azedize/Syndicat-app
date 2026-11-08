import type { ErrorEntries } from "./types.js";

/** Condominiums, buildings, units, co-owners, tenants and leases. */
export const PROPERTY_ERRORS: ErrorEntries = {
  // ── Condominiums ──
  "Syndicat introuvable": ["CONDOMINIUM_NOT_FOUND", "Condominium not found.", "الملكية المشتركة غير موجودة."],
  "Syndicat introuvable.": ["CONDOMINIUM_NOT_FOUND", "Condominium not found.", "الملكية المشتركة غير موجودة."],
  "Syndicat cible introuvable": ["CONDOMINIUM_NOT_FOUND", "Target condominium not found.", "الملكية المشتركة المستهدفة غير موجودة."],
  "La supervision est requise pour modifier un syndicat.": ["SUPERVISION_REQUIRED", "Supervision mode is required to change a condominium.", "وضع الإشراف مطلوب لتعديل ملكية مشتركة."],
  "La supervision et le syndicat cible sont requis pour modifier un membre de syndicat": ["SUPERVISION_REQUIRED", "Supervision mode and the target condominium are required to change a condominium member.", "وضع الإشراف والملكية المشتركة المستهدفة مطلوبان لتعديل عضو."],
  "Le syndicat cible ne correspond pas au membre demandé": ["CONDOMINIUM_MISMATCH", "The target condominium does not match the requested member.", "الملكية المشتركة المستهدفة لا تطابق العضو المطلوب."],
  "name and address are required": ["NAME_AND_ADDRESS_REQUIRED", "Name and address are required.", "الاسم والعنوان مطلوبان.", "Le nom et l'adresse sont obligatoires."],
  "name est requis": ["NAME_REQUIRED", "Name is required.", "الاسم مطلوب.", "Le nom est obligatoire."],

  // ── Buildings ──
  "Immeuble introuvable": ["BUILDING_NOT_FOUND", "Building not found.", "العمارة غير موجودة."],
  "Building not found": ["BUILDING_NOT_FOUND", "Building not found.", "العمارة غير موجودة.", "Immeuble introuvable"],
  "Accès refusé à cet immeuble": ["BUILDING_FORBIDDEN", "Access to this building is denied.", "تم رفض الوصول إلى هذه العمارة."],
  "Accès refusé : cet immeuble n'appartient pas à votre syndicat": ["BUILDING_FORBIDDEN", "Access denied: this building does not belong to your condominium.", "تم رفض الوصول: هذه العمارة لا تنتمي إلى ملكيتك المشتركة."],
  "Bâtiment hors du périmètre du syndicat": ["BUILDING_OUT_OF_SCOPE", "This building is outside the condominium.", "هذه العمارة خارج نطاق الملكية المشتركة."],
  "Immeuble sans syndicat": ["BUILDING_WITHOUT_CONDOMINIUM", "This building has no condominium.", "هذه العمارة غير مرتبطة بملكية مشتركة."],
  "Immeuble sans syndicat : paiement impossible": ["BUILDING_WITHOUT_CONDOMINIUM", "This building has no condominium: payment is not possible.", "هذه العمارة غير مرتبطة بملكية مشتركة: الأداء غير ممكن."],
  "La supervision est requise pour accéder aux immeubles.": ["SUPERVISION_REQUIRED", "Supervision mode is required to access buildings.", "وضع الإشراف مطلوب للوصول إلى العمارات."],
  "La supervision est requise pour accéder à cet immeuble.": ["SUPERVISION_REQUIRED", "Supervision mode is required to access this building.", "وضع الإشراف مطلوب للوصول إلى هذه العمارة."],

  // ── Units ──
  "Lot introuvable": ["UNIT_NOT_FOUND", "Unit not found.", "الوحدة غير موجودة."],
  "Lot ou immeuble invalide": ["UNIT_OR_BUILDING_INVALID", "Invalid unit or building.", "وحدة أو عمارة غير صالحة."],
  "Le lot n'appartient pas à cet immeuble": ["UNIT_NOT_IN_BUILDING", "The unit does not belong to this building.", "الوحدة لا تنتمي إلى هذه العمارة."],
  "Ce lot a un historique : archivez-le au lieu de le supprimer.": ["UNIT_HAS_HISTORY", "This unit has a history: archive it instead of deleting it.", "لهذه الوحدة سجلّ: قم بأرشفتها بدل حذفها."],

  // ── Co-owners ──
  "Membre introuvable": ["MEMBER_NOT_FOUND", "Member not found.", "العضو غير موجود."],
  "Un copropriétaire avec cet email existe déjà dans ce syndicat": ["MEMBER_EMAIL_EXISTS", "A co-owner with this email already exists in this condominium.", "يوجد بالفعل مالك مشترك بهذا البريد في هذه الملكية المشتركة."],
  "Cette adresse est déjà celle d'un autre copropriétaire de votre copropriété.": ["EMAIL_TAKEN_MEMBER", "This address already belongs to another co-owner of your condominium.", "هذا العنوان يخص مالكًا مشتركًا آخر في ملكيتك المشتركة."],

  // ── Tenants and leases ──
  "Locataire introuvable": ["TENANT_NOT_FOUND", "Tenant not found.", "المكتري غير موجود."],
  "Ce lot a déjà un bail en cours : enregistrez d'abord le départ du locataire actuel.": ["LEASE_ALREADY_ACTIVE", "This unit already has an active lease: record the current tenant's departure first.", "لهذه الوحدة عقد كراء جارٍ: سجّل أولًا مغادرة المكتري الحالي."],
  "Ce locataire occupe un lot : enregistrez son départ au lieu de supprimer sa fiche.": ["TENANT_OCCUPIES_UNIT", "This tenant occupies a unit: record their departure instead of deleting their record.", "هذا المكتري يشغل وحدة: سجّل مغادرته بدل حذف ملفه."],
  "La supervision est requise pour accéder à ce bail.": ["SUPERVISION_REQUIRED", "Supervision mode is required to access this lease.", "وضع الإشراف مطلوب للوصول إلى عقد الكراء هذا."],
  "Les locataires n'ont pas accès aux assemblées générales": ["TENANT_NO_GENERAL_ASSEMBLY", "Tenants do not have access to general assemblies.", "لا يحق للمكترين الوصول إلى الجموع العامة."],
};

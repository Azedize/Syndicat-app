/**
 * Fictitious reference vocabulary for Moroccan condominium data. No real
 * person, company or phone number: names are combined at random, e-mails use
 * the reserved `.test` domain, phones use a fictitious 06/07 range.
 */
export const FIRST_NAMES_M = ["Mohammed", "Youssef", "Omar", "Hamza", "Karim", "Anas", "Mehdi", "Rachid", "Said", "Hicham", "Amine", "Yassine", "Adil", "Khalid", "Nabil", "Soufiane", "Ilyas", "Ayoub", "Reda", "Badr", "Othmane", "Zakaria", "Driss", "Abdelilah", "Tarik", "Jamal", "Mustapha", "Hassan", "Ismail", "Ali"];
export const FIRST_NAMES_F = ["Fatima", "Khadija", "Salma", "Imane", "Sara", "Nadia", "Houda", "Laila", "Meryem", "Zineb", "Asmae", "Hajar", "Ghita", "Kawtar", "Siham", "Loubna", "Hanane", "Nouhaila", "Chaimae", "Rim", "Yasmine", "Btissam", "Najat", "Samira", "Amal", "Ikram", "Wiam", "Douae", "Hind", "Malika"];
export const LAST_NAMES = ["Alaoui", "Benali", "El Idrissi", "Tazi", "Bennani", "Chraibi", "El Fassi", "Berrada", "Benjelloun", "Lahlou", "Ouazzani", "Sqalli", "Kettani", "Amrani", "Bouzidi", "Ziani", "El Amrani", "Tahiri", "Naciri", "Belkadi", "Saidi", "Mansouri", "Rifai", "Hajji", "Kabbaj", "Benkirane", "El Ouardi", "Lamrani", "Boukhari", "Cherkaoui", "Filali", "Guessous", "Haddad", "Jebli", "Lazrak", "Mernissi", "Nejjar", "Ouahbi", "Raiss", "Slaoui"];
/** Arabic-script names, for profiles whose preferred language is Arabic. */
export const FIRST_NAMES_AR = ["محمد", "يوسف", "عمر", "حمزة", "كريم", "فاطمة", "خديجة", "سلمى", "إيمان", "سارة", "نادية", "هدى", "مريم", "زينب", "أمين", "ياسين", "خالد", "نبيل", "رشيد", "ليلى"];
export const LAST_NAMES_AR = ["العلوي", "بنعلي", "الإدريسي", "التازي", "بناني", "الشرايبي", "الفاسي", "برادة", "بنجلون", "لحلو", "الوزاني", "الكتاني", "العمراني", "الزياني", "الطاهري", "المنصوري", "الرفاعي", "الحجي", "القباج", "الشرقاوي"];

export const CITIES = [
  { city: "Casablanca", region: "Casablanca-Settat", weight: 22, districts: ["Maârif", "Gauthier", "Anfa", "Bourgogne", "Oasis", "Sidi Maârouf", "Ain Diab", "Hay Hassani", "Belvédère", "CIL"] },
  { city: "Rabat", region: "Rabat-Salé-Kénitra", weight: 12, districts: ["Agdal", "Hay Riad", "Souissi", "Hassan", "Les Orangers", "Océan"] },
  { city: "Tanger", region: "Tanger-Tétouan-Al Hoceïma", weight: 12, districts: ["Malabata", "Iberia", "Marchane", "Boubana", "Achakar", "Val Fleuri"] },
  { city: "Marrakech", region: "Marrakech-Safi", weight: 10, districts: ["Guéliz", "Hivernage", "Targa", "Massira", "Agdal", "Palmeraie"] },
  { city: "Fès", region: "Fès-Meknès", weight: 8, districts: ["Ville Nouvelle", "Narjiss", "Route d'Imouzzer", "Saïss", "Atlas"] },
  { city: "Agadir", region: "Souss-Massa", weight: 7, districts: ["Founty", "Talborjt", "Dakhla", "Hay Mohammadi", "Les Amicales"] },
  { city: "Tétouan", region: "Tanger-Tétouan-Al Hoceïma", weight: 6, districts: ["Mhannech", "Wilaya Center", "Touabel", "Sania Ramel"] },
  { city: "Meknès", region: "Fès-Meknès", weight: 5, districts: ["Hamria", "Marjane", "Plaisance"] },
  { city: "Kénitra", region: "Rabat-Salé-Kénitra", weight: 4, districts: ["Bir Rami", "La Cigogne", "Mimosas"] },
  { city: "Oujda", region: "Oriental", weight: 4, districts: ["Al Qods", "Lazaret", "Hay El Qods"] },
  { city: "El Jadida", region: "Casablanca-Settat", weight: 3, districts: ["Plateau", "Sidi Bouzid"] },
  { city: "Mohammédia", region: "Casablanca-Settat", weight: 3, districts: ["Parc", "La Colline", "El Alia"] },
] as const;

export const STREETS = ["Avenue Mohammed V", "Boulevard Zerktouni", "Rue Ibn Sina", "Avenue Hassan II", "Boulevard Anfa", "Rue Al Massira", "Avenue des FAR", "Rue Moulay Youssef", "Boulevard Al Qods", "Rue Ibn Battouta", "Avenue Allal El Fassi", "Rue Oued Fès", "Boulevard Abdelmoumen", "Rue Tarik Ibn Ziad", "Avenue Annakhil", "Rue Al Mansour Dahbi"];
export const RESIDENCE_WORDS = ["Les Orangers", "Al Andalous", "Les Jardins d'Anfa", "Riad Salam", "Les Palmiers", "Al Waha", "Les Oliviers", "Dar Essalam", "Le Belvédère", "Les Jasmins", "Al Firdaous", "Les Hauts de la Corniche", "Les Terrasses", "Nakhil", "Atlas Park", "Les Amandiers", "Al Boustane", "Le Panorama", "Les Cèdres", "Yasmine", "Al Manar", "Les Citronniers", "Le Patio", "Bab Al Bahr", "Les Arcades"];
export const BUILDING_WORDS = ["A", "B", "C", "D", "Nord", "Sud", "Est", "Ouest", "Jasmin", "Rose", "Lilas", "Cèdre"];
export const PROFESSIONS = ["Ingénieur", "Enseignant", "Médecin", "Pharmacienne", "Commerçant", "Avocate", "Architecte", "Comptable", "Infirmière", "Fonctionnaire", "Chef d'entreprise", "Retraité", "Étudiante", "Développeur", "Banquier", "Journaliste", "Consultante", "Technicien", "Artisan", "Gérante"];

export const SYNDIC_COMPANIES = ["Atlas Gestion Immobilière", "Syndic Plus Maroc", "Résidences Services", "Copro Conseil", "Al Amane Syndic", "Gestion Patrimoine Nord", "Sud Syndic", "Medina Property Management", "Horizon Syndic", "Bayt Gestion", "Le Syndic Moderne", "Pro Copropriété"];

export const PRESTATAIRE_TYPES = [
  ["nettoyage", "Propreté"],
  ["ascenseur", "Ascenseurs"],
  ["plomberie", "Plomberie"],
  ["electricite", "Électricité"],
  ["securite", "Sécurité"],
  ["jardinage", "Espaces verts"],
  ["peinture", "Peinture"],
  ["menuiserie", "Menuiserie"],
] as const;

export const BUDGET_CATEGORIES = [
  ["entretien_general", "Entretien des parties communes", 0.22],
  ["nettoyage", "Nettoyage", 0.16],
  ["gardiennage", "Gardiennage et sécurité", 0.2],
  ["eau", "Eau des parties communes", 0.07],
  ["electricite", "Électricité des parties communes", 0.1],
  ["ascenseur", "Maintenance ascenseur", 0.12],
  ["assurance", "Assurance de l'immeuble", 0.08],
  ["jardin", "Espaces verts", 0.05],
] as const;

export const CLAIM_SAMPLES: Record<string, string[]> = {
  fuite_eau: ["Fuite d'eau au plafond du hall", "Infiltration dans la cage d'escalier", "Fuite sur la colonne montante", "Robinet extérieur qui fuit"],
  ascenseur: ["Ascenseur bloqué au 3e étage", "Porte d'ascenseur qui ne ferme pas", "Bruit anormal dans l'ascenseur", "Bouton d'appel hors service"],
  eclairage: ["Éclairage du parking en panne", "Ampoules grillées dans l'escalier", "Minuterie du hall défectueuse"],
  electricite: ["Coupure électrique dans les parties communes", "Disjoncteur qui saute", "Prise du local technique endommagée"],
  bruit: ["Nuisances sonores la nuit", "Travaux bruyants hors horaires"],
  proprete: ["Poubelles non vidées", "Escaliers sales", "Encombrants dans le couloir"],
  securite: ["Porte d'entrée qui ne se verrouille pas", "Interphone hors service", "Caméra du parking hors ligne"],
  parties_communes: ["Carrelage cassé dans le hall", "Boîtes aux lettres endommagées", "Peinture écaillée dans l'escalier"],
  stationnement: ["Véhicule garé sur une place privée", "Barrière du parking en panne"],
  autre: ["Demande d'information sur le règlement", "Antenne collective défectueuse"],
};

export const ANNOUNCEMENT_SAMPLES = [
  ["Coupure d'eau programmée", "Une coupure d'eau aura lieu mardi de 9 h à 12 h pour des travaux sur la colonne."],
  ["Nettoyage de la façade", "Le nettoyage de la façade commence lundi. Merci de fermer vos fenêtres."],
  ["Assemblée générale annuelle", "L'assemblée générale se tiendra dans la salle commune. La convocation suit."],
  ["Entretien de l'ascenseur", "L'ascenseur sera à l'arrêt jeudi matin pour la maintenance trimestrielle."],
  ["Rappel : tri des déchets", "Merci de déposer les cartons pliés dans le local prévu à cet effet."],
  ["Désinsectisation des parties communes", "Un traitement préventif sera réalisé vendredi."],
  ["Nouveau gardien de nuit", "Nous accueillons notre nouveau gardien de nuit à partir du 1er du mois."],
  ["Travaux de peinture", "La peinture de la cage d'escalier B débute la semaine prochaine."],
];

export const PUBLICATION_SAMPLES = ["Merci à l'équipe de nettoyage pour le hall impeccable", "Proposition de jardin partagé sur la terrasse", "Objets trouvés au parking", "Retour sur la réunion du conseil", "Horaires de la piscine cet été", "Atelier recyclage pour les enfants samedi"];

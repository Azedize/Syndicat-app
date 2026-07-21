import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  time: string;
}

const SUGGESTED: { icon: keyof typeof Feather.glyphMap; label: string; query: string }[] = [
  { icon: "check-square", label: "Créer une élection", query: "Comment créer une élection syndicale ?" },
  { icon: "credit-card", label: "Cotisations en retard", query: "Comment gérer les cotisations en retard ?" },
  { icon: "users", label: "Ajouter un membre", query: "Comment ajouter un nouveau membre ?" },
  { icon: "file-text", label: "Générer un PV", query: "Comment générer un procès-verbal de réunion ?" },
  { icon: "shield", label: "Aide juridique", query: "Quels sont mes droits syndicaux ?" },
  { icon: "bar-chart-2", label: "Rapports financiers", query: "Comment générer un rapport financier ?" },
];

function getAIResponse(query: string, role: string): string {
  const q = query.toLowerCase();

  if (q.includes("élection") || q.includes("election") || q.includes("vote") || q.includes("candidat")) {
    return "Pour créer une élection syndicale :\n\n1. Rendez-vous dans **Élections** via le menu Plus\n2. Appuyez sur le bouton **+** en haut à droite\n3. Renseignez le titre, les dates de début/fin et la description\n4. Ajoutez les candidats avec leurs profils\n5. Publiez l'élection pour que les membres puissent voter\n\nLes résultats sont calculés automatiquement et un PV peut être téléchargé à la clôture. Les membres reçoivent une notification automatique.";
  }

  if (q.includes("cotisation") || q.includes("retard") || q.includes("impayé") || q.includes("paiement")) {
    return "Pour gérer les cotisations en retard :\n\n1. Allez dans **Finance** → onglet **Cotisations**\n2. Filtrez par statut **En retard**\n3. Vous pouvez envoyer des relances individuelles via le profil membre\n4. Le module **Prévisions** (nouvel onglet Finance) analyse le risque de non-paiement\n\nPour les cotisations membres, consultez aussi **Mes Cotisations** qui permet aux membres de payer directement. Les rappels automatiques sont configurables dans Paramètres → Notifications.";
  }

  if (q.includes("membre") || q.includes("adhérent") || q.includes("inscription")) {
    return "Pour ajouter un nouveau membre :\n\n1. Allez dans l'onglet **Membres**\n2. Appuyez sur **+** (super admin / admin syndicat seulement)\n3. Renseignez nom, email, téléphone, profession\n4. Choisissez le statut initial (Actif / En attente)\n5. Le membre reçoit un email d'invitation avec ses identifiants\n\nLes membres peuvent aussi compléter leur profil via **Compléter le Profil** dans le menu. Leur statut de cotisation est mis à jour automatiquement chaque mois.";
  }

  if (q.includes("pv") || q.includes("procès-verbal") || q.includes("compte rendu") || q.includes("réunion")) {
    return "Pour générer un procès-verbal :\n\n1. Allez dans **Procès-Verbaux** (menu Plus → Gouvernance & Juridique)\n2. Sélectionnez la réunion concernée\n3. Appuyez sur **Générer PV**\n4. Complétez l'ordre du jour, les présents et les décisions\n5. Le PV est généré en PDF et archivé automatiquement\n\nVous pouvez aussi utiliser le module **Documents** → Générer pour créer des PV à partir de modèles. Les PV des AG sont publics pour tous les membres.";
  }

  if (q.includes("juridique") || q.includes("droit") || q.includes("loi") || q.includes("légal") || q.includes("contrat")) {
    return "Le **Module Juridique** (menu Plus → Gouvernance & Juridique) offre :\n\n• **Alertes juridiques** — Veille sur les changements légaux impactant votre syndicat\n• **Analyse IA des risques** — Évaluation automatique de votre conformité\n• **Répertoire juridique** — Base de données de lois et textes de référence\n• **Convention Collective** — Accès à votre convention avec recherche intégrée\n• **Assistance** — Formulaire de demande d'aide juridique\n\nPour les urgences, contactez votre commission juridique via le Chat.";
  }

  if (q.includes("rapport") || q.includes("statistique") || q.includes("analyse") || q.includes("finance") || q.includes("budget")) {
    return "Pour accéder aux rapports financiers :\n\n1. **Rapports** — Menu Plus → Finance & Rapports → Rapports\n2. **Statistiques Globales** — Vue complète multi-syndicats (super admin)\n3. **Finance** (onglet) → Overview — Tableau de bord financier\n4. **Prévisions** (nouvel onglet) — Prédiction des encaissements\n\nLes rapports peuvent être exportés en **PDF** ou **Excel**. Le **Bilan Social** et les **Indicateurs RH** sont disponibles dans Formation & Annuaire.";
  }

  if (q.includes("chat") || q.includes("message") || q.includes("communication") || q.includes("contacter")) {
    return "Pour communiquer avec les membres :\n\n1. **Chat Hub** — Conversations directes et de groupe\n2. **Messagerie Interne** — Messages officiels (circulaires, convocations, décisions)\n3. **Publications** — Actualités et articles syndicaux\n4. **Alertes** — Notifications urgentes à tous les membres\n\nLe Chat supporte les messages groupe (pour les commissions et bureaux) et les conversations privées. Vous pouvez joindre des documents aux messages.";
  }

  if (q.includes("gouvernance") || q.includes("bureau") || q.includes("commission") || q.includes("structure") || q.includes("organigramme")) {
    return "Le module **Gouvernance** vous permet de :\n\n• Visualiser l'organigramme interactif du syndicat\n• Gérer les bureaux nationaux et régionaux\n• Configurer les commissions et délégations\n• Suivre les mandats et leur durée\n• Utiliser le **Simulateur de Structure** pour tester des reorganisations\n• Gérer les **Workflows d'Approbation** pour les décisions importantes\n\nLes **Tâches Récurrentes** (nouveau module) permettent de planifier les obligations syndicales périodiques.";
  }

  if (q.includes("formation") || q.includes("compétence") || q.includes("apprendre") || q.includes("cours")) {
    return "Le module **Formations** propose :\n\n• Catalogue de formations syndicales, juridiques, pédagogiques\n• Formations en présentiel, à distance et hybrides\n• Certifications disponibles pour les délégués\n• Droits à la Formation — suivi CPF et heures de délégation\n\nAllez dans **Formations** via le menu Plus → Formation & Annuaire. Les membres peuvent s'inscrire directement. Les admins voient la liste de tous les inscrits et peuvent valider les demandes.";
  }

  if (q.includes("abonnement") || q.includes("plan") || q.includes("tarif") || q.includes("prix") || q.includes("facturation")) {
    return "Les **Abonnements** VERIDIAN :\n\n• **Starter** — Jusqu'à 50 membres, fonctionnalités de base\n• **Professional** — Jusqu'à 200 membres, finances avancées, marketplace\n• **Enterprise** — Membres illimités, IA, multi-syndicats, support prioritaire\n\nAccédez à **Abonnements** via le menu Plus → Abonnements & Facturation. Les super admins voient tous les abonnements actifs. Les upgrades sont immédiats. Contactez le support pour les remises syndicales.";
  }

  if (q.includes("bonjour") || q.includes("salut") || q.includes("aide") || q.includes("comment")) {
    return "Bonjour ! 👋 Je suis votre assistant VERIDIAN.\n\nJe peux vous aider avec :\n\n• 🗳️ **Élections** — Créer, gérer, publier les résultats\n• 👥 **Membres** — Adhésions, cotisations, profils\n• 💰 **Finance** — Transactions, salaires, prévisions\n• ⚖️ **Juridique** — Droits, alertes, conformité\n• 📄 **Documents** — PV, statuts, attestations\n• 🏛️ **Gouvernance** — Bureau, commissions, mandats\n• 💬 **Communication** — Chat, publications, alertes\n\nQuelle est votre question ?";
  }

  if (q.includes("marketplace") || q.includes("boutique") || q.includes("produit") || q.includes("commande") || q.includes("achat")) {
    return "La **Marketplace VERIDIAN** permet :\n\n**Pour les membres :**\n• Acheter des produits syndicaux (livres, matériel, services)\n• Vendre via **Ma Boutique** (en attente de validation admin)\n• Suivre les commandes et livraisons\n• Laisser des avis sur les produits\n\n**Pour les admins :**\n• Valider les nouveaux produits\n• Gérer le catalogue\n• Consulter les commissions sur chaque vente\n\nAccédez-y depuis l'onglet **Marché** dans la barre du bas.";
  }

  if (q.includes("syndicat") || q.includes("créer") || q.includes("configurer") || q.includes("setup")) {
    return "Pour créer un nouveau syndicat :\n\n1. Menu Plus → Administration Globale → **Créer un Syndicat**\n2. Étape 1 : Identité (nom, secteur, région)\n3. Étape 2 : Contact (adresse, téléphone, email)\n4. Étape 3 : Légal (forme juridique, date de création)\n5. Étape 4 : Configuration (cycle de cotisation, paramètres)\n\n*Disponible uniquement pour les Super Admins.* Une fois créé, désignez un Admin Syndicat et commencez à ajouter des membres.";
  }

  return "Je n'ai pas de réponse précise à cette question, mais voici comment obtenir de l'aide :\n\n1. 📚 Consultez le **Répertoire Juridique** pour les questions légales\n2. 🎫 Ouvrez un **Ticket Support** (Menu Plus → Support → Tickets Support)\n3. 💬 Contactez votre administrateur via le **Chat**\n4. 📋 Consultez les **Documents** pour les procédures officielles\n\nN'hésitez pas à reformuler votre question avec plus de détails, je ferai de mon mieux pour vous aider !";
}

const now = () => {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function AIAssistant() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      text: "Bonjour ! 👋 Je suis votre assistant syndical VERIDIAN.\n\nPosez-moi n'importe quelle question sur la gestion de votre syndicat — élections, finances, membres, juridique, documents...",
      isUser: false,
      time: now(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const listRef = useRef<FlatList>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const pulseBtn = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.88, duration: 120, useNativeDriver: false }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: false }),
    ]).start();
  };

  const handleOpen = () => {
    pulseBtn();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setOpen(true);
  };

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), text: text.trim(), isUser: true, time: now() };
    setMessages((prev) => [...prev, userMsg]);
    setInputText("");
    setIsTyping(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

    const delay = 900 + Math.random() * 800;
    setTimeout(() => {
      const response = getAIResponse(text, user?.role ?? "member");
      const aiMsg: Message = { id: (Date.now() + 1).toString(), text: response, isUser: false, time: now() };
      setIsTyping(false);
      setMessages((prev) => [...prev, aiMsg]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }, delay);
  };

  const handleSuggest = (query: string) => {
    Haptics.selectionAsync();
    sendMessage(query);
  };

  const handleReset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMessages([{
      id: "welcome",
      text: "Bonjour ! 👋 Je suis votre assistant syndical VERIDIAN.\n\nPosez-moi n'importe quelle question sur la gestion de votre syndicat — élections, finances, membres, juridique, documents...",
      isUser: false,
      time: now(),
    }]);
  };

  return (
    <>
      <Animated.View
        style={[
          styles.fab,
          {
            bottom: insets.bottom + 90,
            backgroundColor: colors.primary,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <TouchableOpacity onPress={handleOpen} activeOpacity={0.85} style={styles.fabInner}>
          <Feather name="cpu" size={22} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View style={[styles.aiAvatar, { backgroundColor: colors.primary }]}>
              <Feather name="cpu" size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Assistant IA VERIDIAN</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: "#10b981" }]} />
                <Text style={[styles.statusLabel, { color: colors.mutedForeground }]}>En ligne — Prêt à répondre</Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: colors.secondary }]}
              onPress={handleReset}
            >
              <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerBtn, { backgroundColor: colors.secondary }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setOpen(false); }}
            >
              <Feather name="x" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 12 }}
              showsVerticalScrollIndicator={false}
              onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
              ListHeaderComponent={
                messages.length === 1 ? (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={[styles.suggestHeader, { color: colors.mutedForeground }]}>SUGGESTIONS RAPIDES</Text>
                    <View style={styles.suggestGrid}>
                      {SUGGESTED.map((s) => (
                        <TouchableOpacity
                          key={s.label}
                          style={[styles.suggestChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                          onPress={() => handleSuggest(s.query)}
                          activeOpacity={0.75}
                        >
                          <View style={[styles.suggestChipIcon, { backgroundColor: colors.primary + "18" }]}>
                            <Feather name={s.icon} size={13} color={colors.primary} />
                          </View>
                          <Text style={[styles.suggestChipText, { color: colors.foreground }]}>{s.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ) : null
              }
              renderItem={({ item: msg }) => (
                <View style={[styles.msgRow, msg.isUser && styles.msgRowUser]}>
                  {!msg.isUser && (
                    <View style={[styles.msgAvatar, { backgroundColor: colors.primary }]}>
                      <Feather name="cpu" size={12} color="#fff" />
                    </View>
                  )}
                  <View style={[styles.msgGroup, msg.isUser && { alignItems: "flex-end" }]}>
                    <View
                      style={[
                        styles.bubble,
                        msg.isUser
                          ? { backgroundColor: colors.primary }
                          : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                      ]}
                    >
                      <Text style={[styles.bubbleText, { color: msg.isUser ? "#fff" : colors.foreground }]}>
                        {msg.text}
                      </Text>
                    </View>
                    <Text style={[styles.msgTime, { color: colors.mutedForeground }]}>{msg.time}</Text>
                  </View>
                </View>
              )}
              ListFooterComponent={
                isTyping ? (
                  <View style={styles.msgRow}>
                    <View style={[styles.msgAvatar, { backgroundColor: colors.primary }]}>
                      <Feather name="cpu" size={12} color="#fff" />
                    </View>
                    <View style={[styles.bubble, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                      <TypingDots colors={colors} />
                    </View>
                  </View>
                ) : null
              }
            />

            <View
              style={[
                styles.inputRow,
                {
                  backgroundColor: colors.card,
                  borderTopColor: colors.border,
                  paddingBottom: Math.max(insets.bottom, 16),
                },
              ]}
            >
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Posez votre question..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                maxLength={400}
                onSubmitEditing={() => sendMessage(inputText)}
              />
              <TouchableOpacity
                style={[styles.sendBtn, { backgroundColor: inputText.trim() ? colors.primary : colors.muted }]}
                onPress={() => sendMessage(inputText)}
                disabled={!inputText.trim() || isTyping}
              >
                <Feather name="send" size={18} color={inputText.trim() ? "#fff" : colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

function TypingDots({ colors }: { colors: any }) {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  React.useEffect(() => {
    const anim = (d: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: false }),
          Animated.timing(d, { toValue: 0.3, duration: 300, useNativeDriver: false }),
        ])
      );
    const a1 = anim(dot1, 0);
    const a2 = anim(dot2, 150);
    const a3 = anim(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, []);

  return (
    <View style={{ flexDirection: "row", gap: 5, paddingVertical: 4, paddingHorizontal: 4 }}>
      {[dot1, dot2, dot3].map((d, i) => (
        <Animated.View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, opacity: d }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 18,
    width: 54,
    height: 54,
    borderRadius: 27,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 999,
  },
  fabInner: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 27 },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
    borderBottomWidth: 1,
  },
  aiAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestHeader: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 1, marginBottom: 8 },
  suggestGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  suggestChipIcon: { width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  suggestChipText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgRowUser: { justifyContent: "flex-end" },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  msgGroup: { maxWidth: "80%", gap: 3 },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular", marginLeft: 4 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 12,
    gap: 8,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});

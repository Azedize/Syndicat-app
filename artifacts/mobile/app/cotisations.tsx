import { Redirect } from "expo-router";

/**
 * Legacy route. In a copropriété the co-owner's contributions are the calls
 * for funds (appels de fonds): they are declared, validated and receipted in
 * the charges screen. The old "cotisations" screen showed union-dues data and
 * its pay button could never succeed, so the route now leads to the real one.
 */
export default function CotisationsScreen() {
  return <Redirect href="/charges" />;
}

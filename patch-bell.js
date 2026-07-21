const fs = require('fs');
let content = fs.readFileSync('artifacts/mobile/app/(tabs)/index.tsx', 'utf8');

const oldBell = '<Feather name="bell" size={20} color={colors.foreground} />';
const newBell = '<Feather name="bell" size={20} color={colors.foreground} />\n            <View style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444", borderWidth: 1.5, borderColor: colors.card }} />';

content = content.replace(oldBell, newBell);

fs.writeFileSync('artifacts/mobile/app/(tabs)/index.tsx', content);

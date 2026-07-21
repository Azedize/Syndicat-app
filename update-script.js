const fs = require('fs');

let content = fs.readFileSync('artifacts/mobile/app/(tabs)/index.tsx', 'utf8');

// Ensure imports
if (!content.includes('import * as api from "@/services/api";')) {
  content = content.replace('import { useColors } from "@/hooks/useColors";', 'import { useColors } from "@/hooks/useColors";\nimport * as api from "@/services/api";\nimport { Animated } from "react-native";');
}

if (!content.includes('useEffect')) {
  content = content.replace('import React, { useState } from "react";', 'import React, { useState, useEffect, useRef } from "react";');
}

fs.writeFileSync('artifacts/mobile/app/(tabs)/index.tsx', content);

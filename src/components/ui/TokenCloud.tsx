'use client';

import { IconCloud } from './IconCloud';

// Token images for the cloud background - these should be saved in public/tokens/
// You need to save the images you provided to these paths:
// 1. BULLISH (green smoker) -> /tokens/bullish.png
// 2. Snowball -> /tokens/snowball.png
// 3. Testicle (yellow outline) -> /tokens/testicle.png
// 4. FKH (flying horse) -> /tokens/fkh.png
// 5. NOBODY (pink ghost) -> /tokens/nobody.png
// 6. LOOK (orange eyes) -> /tokens/look.png
// 7. LC (dog with glasses) -> /tokens/lc.png
// 8. LMAO! (crying laughing) -> /tokens/lmao.png
// 9. WhiteWhale (armored whale) -> /tokens/whitewhale.png

const TOKEN_IMAGES = [
  '/tokens/bullish.png',
  '/tokens/snowball.png',
  '/tokens/testicle.png',
  '/tokens/FKH.png',
  '/tokens/nobody.png',
  '/tokens/look.png',
  '/tokens/lc.png',
  '/tokens/lmao.png',
  '/tokens/whitewhale.png',
];

interface TokenCloudProps {
  className?: string;
  size?: number;
}

export function TokenCloud({ className = '', size = 500 }: TokenCloudProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <IconCloud images={TOKEN_IMAGES} size={size} />
    </div>
  );
}

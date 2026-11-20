// Official brand marks, vendored from the providers' own sites:
// Qwen — qwen.ai favicon asset (img.alicdn.com, 80x80, brand blue #082DFF)
// ILMU — ilmu.ai/assets/favicon.svg (navy #00205B / blue #0048CC starburst)
import qwenMark from "../assets/qwen-mark.png";
import ilmuMark from "../assets/ilmu-mark.svg";

export function QwenLogo({ className }: { className?: string }) {
  return <img src={qwenMark} alt="" aria-hidden="true" className={className} />;
}

export function IlmuLogo({ className }: { className?: string }) {
  return <img src={ilmuMark} alt="" aria-hidden="true" className={className} />;
}
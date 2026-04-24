import { Hr } from "@react-email/components";
import { theme } from "./theme";

export function Divider({ gap = 24 }: { gap?: number }) {
  return <Hr style={{ borderColor: theme.border, borderStyle: "solid", margin: `${gap}px 0` }} />;
}

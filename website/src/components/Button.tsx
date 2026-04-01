import Link from "next/link";

type ButtonVariant = "primary" | "accent" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}

interface ButtonAsLink extends ButtonBaseProps {
  href: string;
  onClick?: never;
  type?: never;
}

interface ButtonAsButton extends ButtonBaseProps {
  href?: never;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit" | "reset";
}

type ButtonProps = ButtonAsLink | ButtonAsButton;

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-4 py-1.5 text-sm",
  md: "px-6 py-2.5 text-sm",
  lg: "px-8 py-3.5 text-sm font-semibold tracking-wider uppercase",
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-foreground text-white hover:bg-foreground/90 active:bg-foreground",
  accent:
    "bg-accent text-white hover:bg-accent-hover active:bg-accent-hover",
  secondary:
    "border border-foreground/20 text-foreground hover:border-foreground/40 active:border-foreground/50",
  ghost:
    "text-foreground hover:underline underline-offset-4 decoration-foreground/30",
};

export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const classes = [
    "inline-flex items-center justify-center font-medium rounded-sm transition-all duration-200 cursor-pointer",
    sizeClasses[size],
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={classes}>
        {children}
      </Link>
    );
  }

  const { onClick, type = "button" } = props as ButtonAsButton;

  return (
    <button type={type} onClick={onClick} className={classes}>
      {children}
    </button>
  );
}

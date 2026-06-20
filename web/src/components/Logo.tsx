import logo from "/images/logo.png";

interface LogoProps {
  className?: React.HTMLAttributes<HTMLImageElement>["className"];
}

export function Logo({ className }: LogoProps) {
  return <img src={logo} alt="Logo" className={className} />;
}

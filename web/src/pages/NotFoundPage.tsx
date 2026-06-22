import { Link } from "react-router-dom";
import { useDictionary } from "@/i18n";

export function NotFoundPage() {
  const dict = useDictionary().errors;
  const common = useDictionary().common;

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center px-4">
        <h1 className="text-6xl font-bold text-muted-foreground/30 mb-4">
          {dict.notFound}
        </h1>
        <p className="text-muted-foreground mb-2">{dict.notFoundDesc}</p>
        <p className="text-muted-foreground/70 text-sm mb-6">{dict.notFoundHint}</p>
        <div className="flex gap-4 justify-center">
          <Link
            to="/dashboard"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            {common.goToDashboard}
          </Link>
          <Link
            to="/"
            className="px-4 py-2 border border-border rounded-lg hover:bg-secondary transition-colors"
          >
            {common.goHome}
          </Link>
        </div>
      </div>
    </div>
  );
}

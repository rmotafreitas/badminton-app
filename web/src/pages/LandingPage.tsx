import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDictionary } from "@/i18n";

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const dict = useDictionary().landing;

  return (
    <div className="max-w-7xl mx-auto px-4 py-16">
      <div className="text-center mb-16">
        <h1 className="text-5xl font-bold mb-4">{dict.title}</h1>
        <p className="text-xl text-gray-600 mb-8">{dict.subtitle}</p>
        <Link
          to={isAuthenticated ? "/dashboard" : "/login"}
          className="inline-block px-8 py-3 bg-blue-600 text-white rounded-lg text-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          {isAuthenticated ? dict.dashboard : dict.login}
        </Link>
      </div>

      <div className="grid md:grid-cols-3 gap-8 mb-16">
        <div className="text-center p-6">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-xl font-bold mb-2">{dict.trackProgress}</h3>
          <p className="text-gray-600">{dict.trackProgressDesc}</p>
        </div>
        <div className="text-center p-6">
          <div className="text-4xl mb-4">🏟️</div>
          <h3 className="text-xl font-bold mb-2">{dict.bookCourts}</h3>
          <p className="text-gray-600">{dict.bookCourtsDesc}</p>
        </div>
        <div className="text-center p-6">
          <div className="text-4xl mb-4">🤝</div>
          <h3 className="text-xl font-bold mb-2">{dict.connect}</h3>
          <p className="text-gray-600">{dict.connectDesc}</p>
        </div>
      </div>
    </div>
  );
}

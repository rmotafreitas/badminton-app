import { useDictionary } from "@/i18n";

export function Footer() {
  const dict = useDictionary().footer;

  return (
    <footer className="footer">
      <div className="flex flex-col md:flex-row items-center justify-between space-y-3 md:space-y-0">
        <div>{dict.copyright}</div>
        <div className="flex gap-4">
          <a href="#" className="text-gray-500 hover:text-gray-700 text-sm">
            {dict.privacyPolicy}
          </a>
          <a href="#" className="text-gray-500 hover:text-gray-700 text-sm">
            {dict.termsOfService}
          </a>
        </div>
      </div>
    </footer>
  );
}

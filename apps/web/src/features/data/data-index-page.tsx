import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Database } from "lucide-react";
import { useAppContext } from "@/app/context";
import { Page, PageHeader } from "@/shared/components/page-header";
import { useDictionary } from "@/shared/i18n";
import { Badge } from "@/shared/ui/badge";
import { Card } from "@/shared/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/shared/ui/empty";
import { Skeleton } from "@/shared/ui/skeleton";
import { dataTablesQuery } from "./api";
import { tableIcon, useLabel } from "./fields";

/** Every table the user may open. What each role sees comes from the server's table registry. */
export function DataIndexPage() {
  const dict = useDictionary().ui;
  const label = useLabel();
  const { api } = useAppContext();
  const tables = useQuery(dataTablesQuery(api));
  return (
    <Page>
      <PageHeader title={dict.data.title} description={dict.data.subtitle} />
      {!tables.data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : tables.data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Database />
            </EmptyMedia>
            <EmptyTitle>{dict.data.title}</EmptyTitle>
            <EmptyDescription>{dict.data.noTables}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tables.data.map((t) => {
            const Icon = tableIcon(t.icon);
            return (
              <Card key={t.key} className="py-0 transition-colors hover:bg-muted/50">
                <Link to="/data/$table" params={{ table: t.key }} className="tap-target flex items-center gap-4 px-5 py-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{label(t.label)}</span>
                    <Badge variant="secondary" className="mt-1">
                      {t.scope === "club" ? dict.data.clubScope : dict.data.allScope}
                    </Badge>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}

import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface PlannedSection {
  title: string;
  description: string;
  endpoints: { path: string; tier?: "Pro" | "Pro Plus" }[];
}

/** Stub page body: real layout, a "coming soon" note and the endpoints each section will use. */
export function ComingSoon({ icon: Icon, intro, sections }: { icon: LucideIcon; intro: string; sections: PlannedSection[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="text-sm">
          <p className="font-medium">Coming soon</p>
          <p className="mt-0.5 text-muted-foreground">{intro}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => (
          <Card key={s.title} size="sm">
            <CardHeader>
              <CardTitle>{s.title}</CardTitle>
              <CardDescription>{s.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-1.5">
                {s.endpoints.map((e) => (
                  <li key={e.path} className="flex items-center justify-between gap-2">
                    <code className="truncate rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{e.path}</code>
                    {e.tier && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {e.tier}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

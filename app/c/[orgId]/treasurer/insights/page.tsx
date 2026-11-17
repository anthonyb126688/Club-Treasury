"use client";

import { ChartColumn } from "lucide-react";
import { EmptyState } from "../../../../_components/ui/EmptyState";
import { PageHeader, treasurerPage } from "../../_components/PageHeader";

// Insights (treasurers): charts of where the club's money goes.
// Placeholder until the Insights page is built.
export default function InsightsPage() {
  return (
    <main className={treasurerPage}>
      <PageHeader title="Insights" />
      <EmptyState icon={ChartColumn} title="Insights are on the way">
        Charts of spending, budgets and dues will show up here.
      </EmptyState>
    </main>
  );
}

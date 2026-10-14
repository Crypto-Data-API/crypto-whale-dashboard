import type { Metadata } from "next";
import { WhaleAccountsView } from "@/components/accounts/whale-accounts-view";

export const metadata: Metadata = { title: "Whale Accounts" };

export default function AccountsPage() {
  return <WhaleAccountsView />;
}

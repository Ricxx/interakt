import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export type AugmentKind = "FLAIR" | "TITLE" | "COLOR";
export type MarketItem = { id: string; name: string; description: string | null; icon: string | null; image: string | null; cost: number; stock: number | null; coded: boolean; redemptionInfo: string | null; kind: "PERK" | "PROFILE"; augment: string | null; augmentKind: AugmentKind | null; active: boolean };
export type ItemInput = { name: string; description?: string; icon?: string; image?: string | null; cost: number; stock?: number | null; redemptionInfo?: string; codes?: string[]; kind?: "PERK" | "PROFILE"; augment?: string; augmentKind?: AugmentKind; active?: boolean };
export type Sale = { buyer: string; itemName: string; cost: number; day: string };
export type RedeemResult = { balance: number; code: string | null; redemptionInfo: string | null };

export function useMarket() {
  return useQuery({ queryKey: ["market"], queryFn: () => api<{ canManage: boolean; balance: number; items: MarketItem[] }>("/api/market") });
}
export function useMyRedemptions() {
  return useQuery({ queryKey: ["redemptions"], queryFn: () => api<{ redemptions: { itemName: string; cost: number; code: string | null; day: string }[] }>("/api/market/redemptions") });
}
export function useSales(enabled: boolean) {
  return useQuery({ queryKey: ["market-sales"], queryFn: () => api<{ sales: Sale[] }>("/api/market/sales"), enabled });
}
export function useRedeem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<RedeemResult>(`/api/market/items/${id}/redeem`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["market"] }); qc.invalidateQueries({ queryKey: ["redemptions"] }); qc.invalidateQueries({ queryKey: ["points"] }); },
  });
}
export function useSaveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: string; data: ItemInput }) => api(v.id ? `/api/market/items/${v.id}` : "/api/market/items", { method: v.id ? "PATCH" : "POST", body: JSON.stringify(v.data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["market"] }),
  });
}
export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api(`/api/market/items/${id}`, { method: "DELETE" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["market"] }) });
}

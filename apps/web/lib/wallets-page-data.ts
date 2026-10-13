import type { WalletDetailData } from "./data";
import { getWalletById, listWalletAdminRowsPage } from "./data";
import { normalizeWalletListQuery, resolveWalletListQuery } from "./wallets-query";

type WalletPageQuery = ReturnType<typeof normalizeWalletListQuery>;
type WalletPageQueryInput = Partial<WalletPageQuery>;

export interface WalletsPageData {
  query: WalletPageQuery;
  listPage: Awaited<ReturnType<typeof listWalletAdminRowsPage>>;
  selectedWalletDetail: WalletDetailData | null;
}

export const getWalletsPageData = async (
  input?: WalletPageQueryInput
): Promise<WalletsPageData> => {
  const query = resolveWalletListQuery(input);
  const [listPage, selectedWalletDetail] = await Promise.all([
    listWalletAdminRowsPage(query),
    query.selected && query.panel ? getWalletById(query.selected) : Promise.resolve(undefined)
  ]);

  return {
    query,
    listPage,
    selectedWalletDetail: selectedWalletDetail ?? null
  };
};

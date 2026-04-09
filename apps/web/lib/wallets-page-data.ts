import type { WalletDetailData } from "./data";
import { getWalletById, listWalletAdminRowsPage, listWalletSavedViews } from "./data";
import { normalizeWalletListQuery, resolveWalletListQuery } from "./wallets-query";

type WalletPageQuery = ReturnType<typeof normalizeWalletListQuery>;
type WalletPageQueryInput = Partial<WalletPageQuery>;

export interface WalletsPageData {
  query: WalletPageQuery;
  listPage: Awaited<ReturnType<typeof listWalletAdminRowsPage>>;
  savedViews: Awaited<ReturnType<typeof listWalletSavedViews>>;
  selectedWalletDetail: WalletDetailData | null;
}

export const getWalletsPageData = async (
  input?: WalletPageQueryInput
): Promise<WalletsPageData> => {
  const savedViews = await listWalletSavedViews();
  const savedView = input?.view ? savedViews.find((view) => view.id === input.view) ?? null : null;
  const query = resolveWalletListQuery(input, savedView?.query);
  const [listPage, selectedWalletDetail] = await Promise.all([
    listWalletAdminRowsPage(query),
    query.selected && query.panel ? getWalletById(query.selected) : Promise.resolve(undefined)
  ]);

  return {
    query,
    listPage,
    savedViews,
    selectedWalletDetail: selectedWalletDetail ?? null
  };
};

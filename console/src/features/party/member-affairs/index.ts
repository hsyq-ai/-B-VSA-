import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import type { PartyAffairItem } from "../../../api/modules/partyAffairs";
import { loadLocalList, saveLocalList } from "../shared/local-cache";
import {
  formatTime,
  sortByTimeDesc,
  statusColorMap,
  typeOptions,
} from "../party-affairs";

const LOCAL_KEY = "copaw_party_affairs_mvp_v1";

export { formatTime, sortByTimeDesc, statusColorMap, typeOptions };

export interface AffairFormValues {
  title: string;
  type: PartyAffairItem["type"];
  deadline?: Dayjs;
  summary?: string;
}

export interface MemberAffairStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  overdue: number;
}

export const loadLocal = (): PartyAffairItem[] => loadLocalList<PartyAffairItem>(LOCAL_KEY);

export const saveLocal = (items: PartyAffairItem[]): void => {
  saveLocalList(LOCAL_KEY, items);
};

export const getVisibleMemberAffairs = (
  items: PartyAffairItem[],
  currentUserName: string,
): { visibleItems: PartyAffairItem[]; fallbackHint: boolean } => {
  const ownItems = items.filter(
    (item) => String(item.assignee || "").trim() === currentUserName,
  );
  return {
    visibleItems: ownItems.length ? ownItems : items,
    fallbackHint: ownItems.length === 0 && items.length > 0,
  };
};

export const calcMemberAffairStats = (
  items: PartyAffairItem[],
): MemberAffairStats => {
  const total = items.length;
  const pending = items.filter((item) => item.status === "待处理").length;
  const processing = items.filter((item) => item.status === "审批中").length;
  const completed = items.filter((item) => item.status === "已办结").length;
  const overdue = items.filter(
    (item) =>
      item.status !== "已办结" &&
      Boolean(item.deadline) &&
      dayjs(item.deadline).isBefore(dayjs()),
  ).length;
  return { total, pending, processing, completed, overdue };
};

export const findMemberAffairFocusItem = (
  items: PartyAffairItem[],
): PartyAffairItem | null => items.find((item) => item.status !== "已办结") || items[0] || null;

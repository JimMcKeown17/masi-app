export interface ItemSetMeta {
  item_set_id: string;
  question_code: string;
  question_version: string;
  language: string;
}

export type ItemSet<TShape = Record<string, unknown>> = ItemSetMeta & TShape;

import type { ItemSet } from '../types/ItemSet';
import type { ReadPassageItemSet } from '../questions/ReadPassageQuestion/types';
import { buildPassage } from './buildPassage';

export const WELA_PLUS_READ_PASSAGE_XH: ItemSet<ReadPassageItemSet> = {
  item_set_id: 'wela_plus_read_passage@2024.1.xh',
  question_code: 'wela_plus_read_passage',
  question_version: '2024.1',
  language: 'xh',
  ...buildPassage([
    'USihle wayethanda kakhulu ukubaleka. Izolo uthe esadlala ebaleni ebaleka, wasuka wakhubeka wawa. Uye walila kakhulu uSihle, waphakama wagoduka eqhwalela.',
    'UThando uhambe naye wamgodusa emgonile. Bathe bakufika ekhaya umama wamthuthuzela uSihle.',
    'Emva kokuba ethule, umama uye wampha amaqebengwana amnandi. Uye wawavuyela kakhulu amaqebengwana, babelana ngawo noThando.',
  ]),
};

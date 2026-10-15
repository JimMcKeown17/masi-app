import type { ItemSet } from '../types/ItemSet';
import type { ListenAndAnswerStoryItemSet } from '../questions/ListenAndAnswerStoryQuestion/types';

export const WELA_PLUS_LISTEN_AND_ANSWER_STORY_XH: ItemSet<ListenAndAnswerStoryItemSet> = {
  item_set_id: 'wela_plus_listen_and_answer_story@2024.1.xh',
  question_code: 'wela_plus_listen_and_answer_story',
  question_version: '2024.1',
  language: 'xh',
  story: 'Intombazana ethile yayihambahamba phandle. Yayinxibe izihlangu zayo zokubaleka ezitsha. Kwakukho imithi emininzi, emide emihle, kuloo ndawo yayihamba kuyo. Ngequbuliso, yeva umntu okhalayo. Yahamba yaya kwelo cala sasivela ngakulo isikhalo yaze yabona inkwenkwe iphantsi komthi. Ecaleni kwayo kwakukho isebe lomthi elaphukileyo. Inkwenkwe le yayisopha inenxeba edolweni kwaye igruzukile nasengqinibeni.',
  questions: [
    { item_key: 'q2.item_1', prompt: 'Yayinxibe ntoni ezinyaweni intombazana?', acceptable_answers: ['izihlangu zokubaleka'] },
    { item_key: 'q2.item_2', prompt: 'Yeva ntoni?', acceptable_answers: ['umntu okhalayo'] },
    { item_key: 'q2.item_3', prompt: 'Ucinga ukuba yayiphi?', acceptable_answers: ['ngasemithini', 'ehlathini', 'epakhini'] },
    { item_key: 'q2.item_4', prompt: 'Kwakwenzeke ntoni enkwenkweni?', acceptable_answers: ['inkwenkwe yawa emthini'] },
    { item_key: 'q2.item_5', prompt: 'Ucinga yeva njani intombazana xa ibona inkwenkwe?', acceptable_answers: ['yayiselza', 'yakhathazeka', 'okanye nayiphi impendulo efana nezi'] },
  ],
};

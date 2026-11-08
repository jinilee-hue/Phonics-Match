// Things the tutor can wear (bought with coins earned by saying the words). Each is a 3D clay render in the same
// soft toy style as the tutor, with a transparent background. `at` = centre x, centre y, width and rotation in the
// tutor art's own px (660×680; head circle centre 355,333 r 225, eyes at 237,279 / 418,307 — the face tilts 8.6°).
// Refit (user: "drees up 아이템들 … 위치라던가 크기라던가 안맞는게 많아" → "학사모 리본은 기존 위치가 나아 그리고 별안경과
// 토끼귀도 기존꺼가 나아 나머진 바꿔" → "토끼 머리띠는 좀더 위로 … 별 안경은 조금만 밑으로 내려서 눈동자랑 맞추는게 …
// 꼬깔모자는 왼쪽으로 좀 이동해서 머리카락을 덮었으면 좋겠어 학사모처럼"): the crown sits on the head top tilted with the
// face, the party hat's rim covers the hair tuft like the grad cap, the flower crown clears the star glasses, the star
// lenses sit on the pupils, the bunny band sits 24 px higher (48 was too high), the bow tie
// is on the face axis. The headphones are gone (user: "헤드셋은 이상한데 그냥 없애는게 어때?"); gloves cover each hand,
// shoes stand on the feet with the feet's leftovers masked off (tools/feet_mask.py; tutor.ts draws the cape behind the body). The grad cap and ribbon
// keep their first spots. Check: scratch pm/items_worn.py.
export type Slot = 'head' | 'face' | 'neck' | 'hands' | 'feet' | 'back';
export interface Piece { at: [number, number, number, number]; flip?: boolean }
export interface Item { id: string; slot: Slot; name: string; price: number; src: string; at: [number, number, number, number]; icon: number; pieces?: Piece[]; h?: number;
  /** drawn only by the 3D tutor (?tutor=3d): the shop lists it only there, the 2D tutor skips it */
  only3d?: boolean }

const base = new URL('./', location.href).href;
const art = (name: string) => `${base}art/${name}.webp`;

// `icon` evens out the shop thumbnails: wide pieces (glasses, flowers) are drawn small by the card,
// so each is scaled until it takes a similar amount of the card.
export const ITEMS: Item[] = [
  { id: 'gradcap', slot: 'head', name: 'Grad Cap', price: 0, src: art('item_gradcap'), at: [368, 130, 345, -4], icon: 1.08 },
  { id: 'bow', slot: 'head', name: 'Ribbon', price: 30, src: art('item_bow'), at: [252, 172, 168, -16], icon: 0.92 },
  { id: 'glasses', slot: 'face', name: 'Glasses', price: 40, src: art('item_glasses'), at: [328, 293, 366, 8.6], icon: 1.38 },
  { id: 'bowtie', slot: 'neck', name: 'Bow Tie', price: 40, src: art('item_bowtie'), at: [310, 440, 175, 8], icon: 1.18 },
  { id: 'party', slot: 'head', name: 'Party Hat', price: 60, src: art('item_party'), at: [400, 30, 222, 15], icon: 1.12 },
  { id: 'stars', slot: 'face', name: 'Star Glasses', price: 60, src: art('item_stars'), at: [347, 313, 400, 8.6], icon: 1.1 },
  { id: 'flowers', slot: 'head', name: 'Flowers', price: 70, src: art('item_flowers'), at: [362, 134, 390, 6], icon: 1.46 },
  { id: 'bunny', slot: 'head', name: 'Bunny Ears', price: 80, src: art('item_bunny'), at: [350, 86, 360, 6], icon: 0.95 },   // band ON the head top, both ends on the fur (user: "토끼 머리띠는 좀더 위로" from 110 = across the forehead; then 62 → "좀더 내려주고")
  { id: 'crown', slot: 'head', name: 'Crown', price: 120, src: art('item_crown'), at: [380, 62, 296, 6], icon: 0.98 },
  // back as a 3D headset that fits the round head (user: "기존에 없앴던 헤드셋도 만들어서 넣으면 되는거 아닌가?"); the 2D art never fit (removed: "헤드셋은 이상한데")
  { id: 'phones', slot: 'head', name: 'Headphones', price: 70, src: art('icon_phones'), at: [330, 340, 660, 0], icon: 0.92, only3d: true },
  { id: 'gloves', slot: 'hands', name: 'Gloves', price: 50, src: art('item_gloves'), at: [330, 340, 220, 0], icon: 1.05, pieces: [
    { at: [67, 287, 136, -30], flip: true },     // the WHOLE raised hand inside, thumb on its thumb (user: "장갑은 손이 밖으로 삐져나왔던데"), fingers along
                                                 // the hand (−32°): the art's cuff→finger-lobe line stands at +2° (round 2 took 11.8° from the cuff→top point
                                                 // and left it 10° upright — user: "장갑 왼쪽손 안맞아 각도 조절해", "장갑은 손 방향에 맞춰서 잘 수정해")
    { at: [608, 502, 124, 152], flip: true },    // the lowered hand along the arm's diagonal (+150°), not hanging straight down; inside the shop stage's clip x ≤ 679 (scratch pm/glove_opt4.py)
  ] },
  { id: 'shoes', slot: 'feet', name: 'Shoes', price: 60, src: art('item_shoes'), at: [330, 340, 220, 0], icon: 1.0, pieces: [
    { at: [257, 660, 130, 7] },                  // low and bigger, the fur's bottom edge over the shoe tops (user: "신발은 발에 신겨야지"
    { at: [422, 662, 130, -7], flip: true },     // → "좀더 신발이 내려가서 맞춰야지" → "신발을 더 키우던가"); the foot outside them is masked off (tools/feet_mask.py)
  ] },
  { id: 'cape', slot: 'back', name: 'Cape', price: 100, src: art('item_cape'), at: [340, 502, 700, 0], icon: 0.95, h: 528 },
];
export const itemById = (id: string) => ITEMS.find((i) => i.id === id);

import type { Relation } from '../../../shared/decideMatch'

export const RELATION_LABEL: Record<Relation, string> = {
  same: 'Same name',
  subset: 'Similar: one name has extra words',
  number_conflict: 'Same words, different number',
  one_word_off: 'One word differs (maybe another variety)',
}

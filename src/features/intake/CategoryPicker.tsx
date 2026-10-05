import { CATEGORIES, MAX_CATEGORIES, categoryLabel, toggleCategory, type Category } from './categories'

type Props = { value: Category[]; onChange: (next: Category[]) => void }

// Fixed list, 1 to 3 values. The first one chosen is the primary category.
export function CategoryPicker({ value, onChange }: Props) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">
        Categories <span className="font-normal opacity-70">(pick 1 to {MAX_CATEGORIES}; first is primary)</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const index = value.indexOf(c)
          const selected = index >= 0
          return (
            <button
              key={c}
              type="button"
              aria-pressed={selected}
              className={`btn btn-sm ${selected ? (index === 0 ? 'btn-primary' : 'btn-secondary') : 'btn-outline'}`}
              onClick={() => onChange(toggleCategory(value, c))}
            >
              {selected && <span className="font-semibold">{index + 1}</span>}
              {categoryLabel(c)}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

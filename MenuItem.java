import java.util.function.Consumer;
import java.util.function.Predicate;

public class MenuItem {
    private final String label;
    private final Consumer<Tamagotchi> action;
    private final Predicate<Tamagotchi> visible;

    public MenuItem(String label, Consumer<Tamagotchi> action) {
        this(label, action, pet -> true);
    }

    public MenuItem(String label,
                    Consumer<Tamagotchi> action,
                    Predicate<Tamagotchi> visible) {

        this.label = label;
        this.action = action;
        this.visible = visible;
    }

    public boolean isVisible(Tamagotchi pet) {
        return visible.test(pet);
    }

    public String getLabel() {
        return label;
    }

    public void execute(Tamagotchi pet) {
        action.accept(pet);
        pet.displayStatus();
    }
}

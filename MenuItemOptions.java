import java.util.function.Consumer;
import java.util.function.Predicate;

public enum MenuItemOptions {
    FEED("Feed", Tamagotchi::feed, pet -> !pet.isAsleep() && pet.getHunger() > 0),
    PLAY("Play", Tamagotchi::play, pet -> !pet.isAsleep() && pet.getEnergy() > 5),
    CLEAN_POOP("Clean Poop", Tamagotchi::clean, pet -> pet.getPoop() > 0),
    GIVE_MEDICINE("Give Medicine", Tamagotchi::giveMedicine, pet -> pet.isSick() && !pet.isAsleep()),
    WAKE_UP("Wake Up", Tamagotchi::wakeUp, pet -> pet.isAsleep() && pet.getEnergy() > 5),
    MAKE_SOUND("Make Sound", Tamagotchi::makeSound, pet -> !pet.isAsleep()),
    CHECK_STATUS("Check Status", Tamagotchi::displayStatus),
    ADVANCE_TIME("Advance Time", Tamagotchi::tick);

    private final MenuItem item;

    MenuItemOptions(String label, Consumer<Tamagotchi> action) {
        this.item = new MenuItem(label, action);
    }

    MenuItemOptions(String label, Consumer<Tamagotchi> action, Predicate<Tamagotchi> visible) {
        this.item = new MenuItem(label, action, visible);
    }

    public MenuItem getItem() {
        return item;
    }
        
}

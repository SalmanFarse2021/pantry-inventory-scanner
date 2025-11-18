import java.util.Scanner;

public class Game {
    private Tamagotchi pet;
    private final Scanner scanner;
    private final Menu menu;

    public Game() {
        this.scanner = new Scanner(System.in);
        // new pet only if no existing pet
        if (pet == null) newPet();

        this.menu = new Menu(pet.getName() + "'s Menu", pet, scanner);
    }

    public final void start() {
        menu.loop();
        System.out.println("See you next time!");
    }

    public final void newPet() {
        System.out.print("Enter your Tamagotchi's name: ");
        String name = scanner.nextLine();

        System.out.println("Choose a species:");


        for (int i = 0; i < Species.values().length; ++i) {
            System.out.println(i + ". " + Species.values()[i]);
        }

        int choice = Helper.readIntInRange(scanner, 0, Species.values().length - 1);
        Species species = Species.values()[choice];

        pet = new Tamagotchi(name, species);
    }
}

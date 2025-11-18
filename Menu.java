import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Scanner;

public class Menu {
    private final Scanner scanner;
    private final String title;
    private final Tamagotchi pet;
    private final List<MenuItem> items = new ArrayList<>();
    private final Map<Integer, MenuItem> visibleItems = new HashMap<>();


    public Menu(String title, Tamagotchi pet, Scanner scanner) {
        this.title = title;
        this.pet = pet;
        this.scanner = scanner;

        for (MenuItemOptions option : MenuItemOptions.values()) {
            items.add(option.getItem());
        }
    }

    public void loop() {
        if (items.isEmpty()) {
            System.out.println("No options available.");
            return;
        }

        pet.displayStatus();

        boolean running = true;
        while (running) {
            printMenu();

            int choice = readChoice();
            running = validateChoice(choice);
        }
    }

    private void printMenu() {
        System.out.println();
        if (title != null && !title.isEmpty()) {
            System.out.println("=== " + title + " ===");
        }

        int index = 1;
        for (MenuItem item : items) {
            if (item.isVisible(pet)) {
                System.out.println(index + ". " + item.getLabel());
                visibleItems.put(index, item);
                index++;
            }
        }
        System.out.println("0) Exit");
        System.out.print("> ");
    }

    private int readChoice() {
        while (!scanner.hasNextInt()) {
            System.out.println("Please enter a valid number.");
            scanner.next();
            System.out.print("> ");
        }
        int value = scanner.nextInt();
        scanner.nextLine(); // consume newline
        return value;
    }

    private boolean validateChoice(int choice) {
            if (choice == 0) return false;

            if (visibleItems.containsKey(choice)) {
                System.out.println();
                visibleItems.get(choice).execute(pet);
            }
            else {
                System.out.println("Invalid choice. Please try again.");
            }
            return true;
    }
}

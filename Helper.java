import java.util.Scanner;

public class Helper {
    public static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    public static int readIntInRange(Scanner scanner, int min, int max) {
        while (true) {
            while (!scanner.hasNextInt()) {
                System.out.println("Please enter a number between " + min + " and " + max + ".");
                scanner.next();
            }

            int value = scanner.nextInt();
            scanner.nextLine(); // consume newline
            if (value >= min && value <= max) {
                return value;
            }

            System.out.println("Choice must be between " + min + " and " + max + ".");
        }
    }
}

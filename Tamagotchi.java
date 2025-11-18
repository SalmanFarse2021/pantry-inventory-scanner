public class Tamagotchi {
    private final String name;
    private final Species species;
    private int hunger;
    private int happiness;
    private int energy;
    private int age;
    private int poop;
    private boolean sick;
    private boolean sleep;
    private boolean immortal;

    // Constructor

    public Tamagotchi(String name, Species species) {
        this.name = name;
        this.species = species;
        this.hunger = 50;
        this.happiness = 50;
        this.energy = 50;
        this.age = 1;
        this.poop = 0;
        this.sick = false;
        this.sleep = false;
    }

    // Auto effects

    public void incrementHunger(int amount) {
        hunger = Math.min(hunger + amount, 100);
    }

    public void decrementHunger(int amount) {
        hunger = Math.max(hunger - amount, 0);
    }

    public void incrementHappiness(int amount) {
        happiness = Math.min(happiness + amount, 100);
    }

    public void decrementHappiness(int amount) {
        happiness = Math.max(happiness - amount, 0);
    }

    public void decrementEnergy(int amount) {
        energy = Math.max(energy - amount, 0);
    }

    public void incrementEnergy(int amount) {
        energy = Math.min(energy + amount, 100);
    }

    public void addPoop() {
        poop = Math.min(poop + 1, 10);
        feedback("feels relieved.");
    }

    public void becomeSick() {
        sick = true;
        feedback("isn't feeling well.");
    }

    public void incrementAge() {
        age = Math.min(age + 1, 100);
        feedback("is now " + age + "-years-old!");
        if (age == 100) {
            immortal = true;
            feedback("has become immortal!");
        }
    }

    public void fallAsleep() {
        sleep = true;
        feedback("feel asleep.");
    }

    // Player actions

    public void feed() {
        decrementHunger(20);
        feedback("enjoyed the meal.");
    }

    public void play() {
        incrementHappiness(10);
        decrementEnergy(5);
        if (energy <= 5) fallAsleep();

        feedback("had lots of fun!");  
    }

    public void clean() {
        poop = 0;
        if (isAsleep()) {
            feedback("looks more comfortable.");
        }
        else {
            feedback("is feeling fresh!");      
        }
    }

    public void giveMedicine() {
        sick = false;
        feedback("is feeling better.");     
    }

    public void wakeUp() {
        sleep = false;
        feedback("is now awake.");
    }

    // Autonomous

    public void makeSound() {
        System.out.println(name + " says: " + species.getSound());
    }

    public void feedback(String message) {
        System.out.println(name + " " + message + "\n");
    }

    // Tick system

    public void tick() {
        incrementHunger(5);

        if (isAsleep()) {
            incrementEnergy(5);
        }
        else {
            decrementEnergy(1);
        }

        if (Math.random() < 0.15) addPoop();
        if (energy <= 5) fallAsleep();

        if (immortal) return;

        incrementAge();
        decrementHappiness(1);
        if (Math.random() < 0.05) becomeSick();
    }

    // Getters

    public String getName() { return name; }
    public int getHunger() { return hunger; }
    public int getHappiness() { return happiness;}
    public int getEnergy() { return energy; }
    public int getAge() { return age; }
    public int getPoop() { return poop; }
    public boolean isSick() { return sick; }
    public boolean isAsleep() { return sleep; }

    public void displayStatus() {
        System.out.println("---- Status ----");
        System.out.println("Name: " + getName());
        System.out.println("Hunger: " + getHunger());
        System.out.println("Happiness: " + getHappiness());
        System.out.println("Energy: " + getEnergy());
        System.out.println("Age: " + getAge());
        System.out.println("Poop count: " + getPoop());
        System.out.println(isSick() ? "Sick" : "Healthy");
        System.out.println(isAsleep() ? "Sleeping" : "Awake");
        System.out.println("----------------");
    }
}

public enum Species {
    CAT("meow!", "Cat"),
    DOG("woof!", "Dog"),
    DRAGON("grrr!", "Dragon"),
    ROBOT("beep boop!", "Robot");

    private final String sound;
    private final String label;

    Species(String sound, String label) {
        this.sound = sound;
        this.label = label;
    }

    public String getSound() {
        return sound;
    }

    @Override
    public String toString() {
        return label;
    }

}

class Pet{
    constructor(name){
        this.name = name;
        this.age = 1;
        this.happiness = 100;
        this.hunger = 0;
        this.boredom = 0;
        this.energy = 100;
    }

    eat(){
        this.hunger -= 10;
        return `${this.name} is eating!`;
    }

    sleep(){
        this.energy += 10;
        return `${this.name} is sleeping!`;
    }

    play(){
        this.happiness += 10;
        this.boredom -= 10;
        return `${this.name} is playing!`;
    }

    checkHappiness(){
        return `${this.name} has a happiness level of ${this.happiness}`;
    }

    checkBordem(){
        return `${this.name} has a boredom level of ${this.boredom}`;
    }

    checkHunger(){
        return `${this.name} has a hunger level of ${this.hunger}`;
    }

    checkEnergy(){
        return `${this.name} has an energy level of ${this.energy}`;
    }

    printInfo(){
        return `${this.name} is ${this.age} years old and has a happiness level of ${this.happiness}, a hunger level of ${this.hunger}, a boredom level of ${this.boredom}, and an energy level of ${this.energy}`;
    }
}
import { User } from './user.js';
import { Pet } from './pet.js';

class Game{
    constructor(){
        this.user = null;
        this.pet = null;
        this.session = null;
        this.loggedIn = false;
    }

    newUser(){
        let username = prompt("Enter a username");
        let email = prompt("Enter an email");
        let password = prompt("Enter a password");
        let birthday = prompt("Enter a birthday");

        this.user = new User(username, email, password, birthday);
    }

    newPet(){
        let name = prompt("Enter a name for your pet");

        this.pet = new Pet(name);
    }

    newSession(){
        this.session = prompt("Enter a session name");
        while (this.loggedIn){
            this.menu();
        }
    }

    menu(){
        while (true) {
            let choice = prompt("Enter a choice: \n1. New User \n2. New Pet \n3. New Session \n4. Play \n5. Quit");
            switch(choice){
                case "1":
                    this.newUser();
                    break;
                case "2":
                    this.newPet();
                    break;
                case "3":
                    this.newSession();
                    break;
                case "4":
                    this.play();
                    break;
                case "5":
                    this.quit();
                    break;
                default:
                    prompt("Invalid choice");
            }
        }
    }

    play(){
        while (true) {
            let choice = prompt("Enter a choice: \n1. Eat \n2. Sleep \n3. Play \n4. Check Happiness \n5. Check Boredom \n6. Check Hunger \n7. Check Energy \n8. Print Info \n9. Quit");
            switch(choice){
                case "1":
                    this.pet.eat();
                    break;
                case "2":
                    this.pet.sleep();
                    break;
                case "3":
                    this.pet.play();
                    break;
                case "4":
                    this.pet.checkHappiness();
                    break;
                case "5":
                    this.pet.checkBoredom();
                    break;
                case "6":
                    this.pet.checkHunger();
                    break;
                case "7":
                    this.pet.checkEnergy();
                    break;
                case "8":
                    this.pet.printInfo();
                    break;
                case "9":
                    this.quit();
                    break;
                default:
                    prompt("Invalid choice");
            }
        }
    }
}

const game = new Game();
game.newSession();
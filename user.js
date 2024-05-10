class User {
    constructor(username, email, password, birthday, pets = []) {
        this.username = username;
        this.email = email;
        this.password = password;
        this.birthday = birthday;
        this.pets = pets;
    }

    updateUsername(newUsername) {
        this.username = newUsername;
    }

    updateEmail(newEmail) {
        this.email = newEmail;
    }

    updatePassword(newPassword) {
        this.password = newPassword;
    }

    updateBirthday(newBirthday) {
        this.birthday = newBirthday;
    }

    addPet(pet) {
        this.pets.push(pet);
    }

    updatePet(index, newPet) {
        this.pets[index] = newPet;
    }
}
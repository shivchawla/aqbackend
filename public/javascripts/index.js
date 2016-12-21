function checkform (argument) {
    $('.error_box').empty();
    if($('#password').val().length < 8 || $('#newPassword').val().length < 8) {
        $('.error_box').append("Password length less than 8 characters")
        $('.error_box').fadeIn(200);
        return false
    }
    if($('#password').val() != $('#newPassword').val()) {
        $('.error_box').append("Passwords dont match")
        $('.error_box').fadeIn(200);
        return false
    }
}


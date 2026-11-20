
export class AppError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
        public readonly code: string,
        public readonly details?: unknown,
    ) {
        super(message);
        this.name = new.target.name;
    }
}

export class ValidationError extends AppError{
    constructor(
        message = "Sorqu melumatlari yanlisdir",
        details?: unknown,
    ) {
        super(message, 400, "VALIDATION_ERROR", details);
    }
}
// ValidationError → Göndərilən məlumatlar müəyyən edilmiş validasiya qaydalarına uyğun deyil.

export class BadRequestError extends AppError {
    constructor(
        message: string,
        code: string,
    ) {
        super(message, 400, code);
    }
// bu hissede details parametri lazim deyil
    
}

export class UnauthorizedError extends AppError {
    constructor(
        message = "Autentifikasiya teleb olunur",
    ) {
        super(message, 401, "UNAUTHORIZED");
    }
}

export class ForbiddenError extends AppError {
    constructor(
        message= "Bu emeliyata icazeniz yoxdur ",
    ) {
        super(message, 403, "FORBIDDEN");
    }
}

export class NotFoundError extends AppError {
    constructor(
        resource = "Resource",

    ) {
        super(`${resource} tapilmadi` , 404, "NOT_FOUND")
    }
}

export class ConflictError extends AppError {
    constructor(
        message = "Konflict",
        code = "CONFLICT",

    ) {
        super(message, 409, code);
    }
}




























// export class AppError extends Error {
//     constructor(
//         message: string,
//         public readonly statusCode: number,
//         public readonly code: string,
//         public readonly details?: unknown,
//     ) {
//         super(message);
//         this.name = new.target.name;
//     }
// }

// export class ValidationError extends AppError {
//     constructor(
//         message = "Sorğu məlumatları yanlışdır",
//         details?: unknown,
//     ) {
//         super(message, 400, "VALIDATION_ERROR", details);
//     }   
// }

// // throw new ValidationError("Email yanlışdır");
// // {
// //   message: "Email yanlışdır",
// //   statusCode: 400,
// //   code: "VALIDATION_ERROR"
// // }

// export class BadRequestError extends AppError {
//     constructor(
//         message: string,
//         code: string,
//     ) {
//         super(message, 400, code);
//     } 
//     // burda status kod sabitdir 400 ,
//     // amma code ve message deyişə bilər.
//     // throw new BadRequestError("Email formatı yanlışdır", "INVALID_EMAIL");
//     // throw new BadRequestError("Password çox qısadır", "INVALID_PASSWORD");
//     // ikiside bad request errorudur amma ferqli mesaj ve kodla
// }

// export class UnauthorizedError extends AppError {
//     constructor(
//         message = "Authentifikasiya tələb olunur",
//     ) {
//         super(message, 401, "UNAUTHORIZED");
//     }
// }

// export class ForbiddenError extends AppError {
//     constructor(
//         message = "Bu emeliyata icazeniz yoxdur ",
//     ) {
//         super(message, 403, "FORBIDDEN0");
//     }
// }

// export class NotFoundError extends AppError {
//     constructor(
//         resource = "Resource",
//     ) {
//         super(`${resource} tapilmadi`, 404, "NOTFOUND")
//     }
// }

// export class ConflictError extends AppError {
//     constructor(
//         message = "Konflikt",
//         code = "CONFLICT",
//     ) {
//         super(message, 409, code);
//     }
// }





























// export class AppError extends Error {
//   constructor(
//     message: string,
//     public readonly statusCode: number,
//     public readonly code: string,
//     public readonly details?: unknown,
//   ) {
//     super(message);
//     this.name = new.target.name;
//   }
// }

// export class ValidationError extends AppError {
//   constructor(message = "Sorğu məlumatları yanlışdır", details?: unknown) {
//     super(message, 400, "VALIDATION_ERROR", details);
//   }
// }

// export class BadRequestError extends AppError {
//   constructor(message: string, code: string) {
//     super(message, 400, code);
//   }
// }

// export class UnauthorizedError extends AppError {
//   constructor(message = "Autentifikasiya tələb olunur") {
//     super(message, 401, "UNAUTHORIZED");
//   }
// }

// export class ForbiddenError extends AppError {
//   constructor(message = "Bu əməliyyata icazəniz yoxdur") {
//     super(message, 403, "FORBIDDEN");
//   }
// }

// export class NotFoundError extends AppError {
//   constructor(resource = "Resurs") {
//     super(`${resource} tapılmadı`, 404, "NOT_FOUND");
//   }
// }

// export class ConflictError extends AppError {
//   constructor(message = "Konflikt", code = "CONFLICT") {
//     super(message, 409, code);
//   }
// }
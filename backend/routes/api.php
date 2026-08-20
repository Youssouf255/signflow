<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DocumentController;
use App\Http\Controllers\SignerController;
use App\Http\Controllers\SigningController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function () {
    Route::post('register', [AuthController::class, 'register']);
    Route::post('login', [AuthController::class, 'login']);
});

Route::prefix('sign')->group(function () {
    Route::get('{token}', [SigningController::class, 'show']);
    Route::post('{token}/viewed', [SigningController::class, 'viewed']);
    Route::get('{token}/file', [SigningController::class, 'file']);
    Route::post('{token}/complete', [SigningController::class, 'sign']);
    Route::post('{token}/decline', [SigningController::class, 'decline']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::get('auth/me', [AuthController::class, 'me']);
    Route::post('auth/logout', [AuthController::class, 'logout']);

    Route::get('dashboard', DashboardController::class);
    Route::get('signers', [SignerController::class, 'index']);

    Route::get('documents', [DocumentController::class, 'index']);
    Route::post('documents', [DocumentController::class, 'store']);
    Route::get('documents/{document}', [DocumentController::class, 'show']);
    Route::put('documents/{document}', [DocumentController::class, 'update']);
    Route::delete('documents/{document}', [DocumentController::class, 'destroy']);
    Route::post('documents/{document}/signers', [DocumentController::class, 'syncSigners']);
    Route::post('documents/{document}/fields', [DocumentController::class, 'syncFields']);
    Route::post('documents/{document}/send', [DocumentController::class, 'send']);
    Route::post('documents/{document}/resend-invite', [DocumentController::class, 'resendInvite']);
    Route::post('documents/{document}/reopen', [DocumentController::class, 'reopen']);
    Route::post('documents/{document}/replace-file', [DocumentController::class, 'replaceFile']);
    Route::get('documents/{document}/file', [DocumentController::class, 'file']);
    Route::get('documents/{document}/audit', [DocumentController::class, 'audit']);
});

<?php

namespace App\Http\Controllers;

use App\Models\Signer;
use Illuminate\Http\Request;

class SignerController extends Controller
{
    public function index(Request $request)
    {
        $signers = Signer::query()
            ->whereHas('document', fn ($q) => $q->where('owner_id', $request->user()->id))
            ->with('document:id,title,status')
            ->latest()
            ->paginate(20);

        return response()->json($signers);
    }
}

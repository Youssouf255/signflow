<?php

namespace App\Http\Controllers;

use App\Models\Document;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function __invoke(Request $request)
    {
        $ownerId = $request->user()->id;

        $stats = [
            'sent' => Document::where('owner_id', $ownerId)->whereIn('status', ['sent', 'in_progress', 'completed', 'declined'])->count(),
            'in_progress' => Document::where('owner_id', $ownerId)->where('status', 'in_progress')->count(),
            'completed' => Document::where('owner_id', $ownerId)->where('status', 'completed')->count(),
            'draft' => Document::where('owner_id', $ownerId)->where('status', 'draft')->count(),
        ];

        $recent = Document::where('owner_id', $ownerId)
            ->withCount('signers')
            ->latest()
            ->limit(8)
            ->get();

        return response()->json([
            'stats' => $stats,
            'recent' => $recent,
        ]);
    }
}

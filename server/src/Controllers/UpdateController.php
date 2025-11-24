<?php

class UpdateController
{
    private $pdo;

    public function __construct($pdo)
    {
        $this->pdo = $pdo;
    }

    /**
     * Get the latest app update information
     * Edit the values below to release a new update
     */
    public function getLatestUpdate()
    {
        // ============================================
        // EDIT THESE VALUES TO RELEASE A NEW UPDATE
        // ============================================
        
        $currentVersion = '1.0.0';  // Current stable version
        $latestVersion = '1.1.0';   // Latest available version (change this to trigger update notification)
        $releaseDate = '2025-11-22'; // Release date of the latest version
        $downloadUrl = 'https://github.com/Sumit7739/roomOS/releases/latest'; // PLACEHOLDER - Add your download link here
        
        $releaseNotes = [

          'This release brings major stability improvements, a complete UI refresh, and the highly requested offline mode. Now you can settle debts and check the roster even when the Wi-Fi is down!',

          '🌟 New Features',
          
          '🔌 Robust Offline Support',
          'RoomOS now works seamlessly without an internet connection.',
          'A new Offline Indicator banner appears when you lose connectivity.',
          'Changes made while offline (like adding expenses or sending chats) are queued and automatically synced when you\'re back online.',
          
          '🔔 In-App Update Notifications',

          'Never miss a version again! The app now automatically checks for updates.',
          'A beautiful new popup alerts you when a new version is available, complete with release notes and a direct download link.',

          '🎨 Complete UI Overhaul',
          
          'The frontend has been significantly polished for a smoother, more premium experience.',
          'Improved navigation and responsive design adjustments.',
          
          '🐛 Bug Fixes & Improvements',

          'Android Build: Fixed keystore path issues ensuring smooth release builds for Android.',
          'Performance: Optimized initial load times and state management.',
          'Navigation: Smarter routing logic to handle authentication states and view history (especially when entering/exiting Chat).',
        ];
        
        // ============================================
        // DO NOT EDIT BELOW THIS LINE
        // ============================================
        
        $hasUpdate = version_compare($latestVersion, $currentVersion, '>');
        
        $response = [
            'success' => true,
            'current_version' => $currentVersion,
            'latest_version' => $latestVersion,
            'has_update' => $hasUpdate,
            'release_date' => $releaseDate,
            'download_url' => $downloadUrl,
            'release_notes' => $releaseNotes
        ];

        http_response_code(200);
        echo json_encode($response);
    }
}

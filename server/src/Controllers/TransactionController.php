<?php

class TransactionController {
    private $pdo;

    public function __construct($pdo) {
        $this->pdo = $pdo;
    }

    private function getUserIdFromToken() {
        $headers = getallheaders();
        if (!isset($headers['Authorization'])) return null;
        
        $token = str_replace('Bearer ', '', $headers['Authorization']);
        
        $stmt = $this->pdo->prepare("SELECT user_id FROM sessions WHERE token = ? AND expires_at > NOW()");
        $stmt->execute([$token]);
        $session = $stmt->fetch();
        
        return $session ? $session['user_id'] : null;
    }

    private function getUserGroup($userId) {
        $stmt = $this->pdo->prepare("SELECT group_id FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        return $stmt->fetch();
    }

    public function add() {
        $userId = $this->getUserIdFromToken();
        if (!$userId) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $user = $this->getUserGroup($userId);
        $data = json_decode(file_get_contents("php://input"), true);

        if (!isset($data['amount']) || !isset($data['description'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing fields']);
            return;
        }

        $amount = floatval($data['amount']);
        if ($amount <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid amount']);
            return;
        }

        try {
            $this->pdo->beginTransaction();

            // Get split_between data for storage
            $splitBetweenData = isset($data['split_between']) && is_array($data['split_between']) 
                ? json_encode($data['split_between']) 
                : null;

            // 1. Record Transaction with split_between info
            $stmt = $this->pdo->prepare("INSERT INTO transactions (group_id, user_id, amount, description, split_between) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([$user['group_id'], $userId, $amount, $data['description'], $splitBetweenData]);

            // 2. Update Balances with selective split
            // Get members to split between (default to all if not specified)
            $splitBetween = isset($data['split_between']) && is_array($data['split_between']) 
                ? $data['split_between'] 
                : null;

            if ($splitBetween === null) {
                // Get all members if not specified
                $stmt = $this->pdo->prepare("SELECT id FROM users WHERE group_id = ?");
                $stmt->execute([$user['group_id']]);
                $splitBetween = $stmt->fetchAll(PDO::FETCH_COLUMN);
            }

            $memberCount = count($splitBetween);

            if ($memberCount > 0) {
                // Check if only one person is selected and it's not the payer
                // In this case, that person owes the full amount
                $isDirectPayment = ($memberCount === 1 && !in_array($userId, $splitBetween));
                
                if ($isDirectPayment) {
                    // Direct payment: selected person owes the full amount
                    $selectedUserId = $splitBetween[0];
                    
                    // Ensure balance rows exist for both users
                    foreach ([$userId, $selectedUserId] as $uid) {
                        $stmt = $this->pdo->prepare("SELECT id FROM balances WHERE group_id = ? AND user_id = ?");
                        $stmt->execute([$user['group_id'], $uid]);
                        if (!$stmt->fetch()) {
                            $stmt = $this->pdo->prepare("INSERT INTO balances (group_id, user_id, balance) VALUES (?, ?, 0)");
                            $stmt->execute([$user['group_id'], $uid]);
                        }
                    }
                    
                    // Payer gets +amount (they are owed)
                    $stmt = $this->pdo->prepare("UPDATE balances SET balance = balance + ? WHERE group_id = ? AND user_id = ?");
                    $stmt->execute([$amount, $user['group_id'], $userId]);
                    
                    // Selected person gets -amount (they owe)
                    $stmt = $this->pdo->prepare("UPDATE balances SET balance = balance - ? WHERE group_id = ? AND user_id = ?");
                    $stmt->execute([$amount, $user['group_id'], $selectedUserId]);
                    
                } else {
                    // Split payment: divide amount among selected members
                    $share = $amount / $memberCount;

                    foreach ($splitBetween as $mid) {
                        // Ensure balance row exists
                        $stmt = $this->pdo->prepare("SELECT id FROM balances WHERE group_id = ? AND user_id = ?");
                        $stmt->execute([$user['group_id'], $mid]);
                        if (!$stmt->fetch()) {
                            $stmt = $this->pdo->prepare("INSERT INTO balances (group_id, user_id, balance) VALUES (?, ?, 0)");
                            $stmt->execute([$user['group_id'], $mid]);
                        }

                        if ($mid == $userId) {
                            // Payer: + (Amount - Share)
                            $change = $amount - $share;
                        } else {
                            // Others: - Share
                            $change = -$share;
                        }

                        $stmt = $this->pdo->prepare("UPDATE balances SET balance = balance + ? WHERE group_id = ? AND user_id = ?");
                        $stmt->execute([$change, $user['group_id'], $mid]);
                    }
                }
            }

            $this->pdo->commit();
            echo json_encode(['message' => 'Transaction added']);

        } catch (Exception $e) {
            $this->pdo->rollBack();
            http_response_code(500);
            echo json_encode(['error' => 'Failed to add transaction: ' . $e->getMessage()]);
        }
    }

    public function list() {
        $userId = $this->getUserIdFromToken();
        if (!$userId) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $user = $this->getUserGroup($userId);

        // Get recent transactions
        $stmt = $this->pdo->prepare("
            SELECT t.*, u.name as user_name 
            FROM transactions t 
            JOIN users u ON t.user_id = u.id 
            WHERE t.group_id = ? 
            ORDER BY t.created_at DESC 
            LIMIT 20
        ");
        $stmt->execute([$user['group_id']]);
        $transactions = $stmt->fetchAll();

        // Get my balance
        $stmt = $this->pdo->prepare("SELECT balance FROM balances WHERE user_id = ?");
        $stmt->execute([$userId]);
        $myBal = $stmt->fetchColumn();

        // Get individual balances (who owes whom)
        // We need to calculate pairwise balances
        $stmt = $this->pdo->prepare("
            SELECT b.user_id, b.balance, u.name as user_name
            FROM balances b 
            JOIN users u ON b.user_id = u.id 
            WHERE b.group_id = ? AND b.user_id != ?
        ");
        $stmt->execute([$user['group_id'], $userId]);
        $otherBalances = $stmt->fetchAll();

        // Transform to show relative balances
        $balances = [];
        foreach ($otherBalances as $other) {
            // If my balance is +100 and their balance is -50
            // Then they owe me 50 (from my perspective)
            // Actually, we need to think differently:
            // Each person has a balance. Positive = they are owed, Negative = they owe
            // To show "X owes you" or "you owe X", we compare balances
            
            // Simpler approach: Show their balance from my perspective
            // If their balance is negative, they owe the group (including me)
            // If their balance is positive, the group owes them (including me)
            
            // Actually for pairwise: we need to calculate based on total balances
            // For now, let's show a simplified view:
            // My balance vs their balance gives us the relationship
            
            $myBalance = floatval($myBal ?: 0);
            $theirBalance = floatval($other['balance']);
            
            // Calculate pairwise balance
            // This is simplified - in reality we'd need more complex calculation
            // For now: if I'm +100 and they're -100, they owe me proportionally
            
            $balances[] = [
                'other_user_id' => $other['user_id'],
                'other_user_name' => $other['user_name'],
                'balance' => -$theirBalance // Negative of their balance shows what they owe/are owed
            ];
        }

        echo json_encode([
            'transactions' => $transactions,
            'balances' => $balances,
            'my_balance' => $myBal ?: 0
        ]);
    }
    
    public function delete() {
        $userId = $this->getUserIdFromToken();
        if (!$userId) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $data = json_decode(file_get_contents("php://input"), true);
        
        if (!isset($data['transaction_id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing transaction_id']);
            return;
        }

        $transactionId = intval($data['transaction_id']);

        try {
            $this->pdo->beginTransaction();

            // Get transaction details to verify ownership and get amount
            $stmt = $this->pdo->prepare("SELECT * FROM transactions WHERE id = ?");
            $stmt->execute([$transactionId]);
            $transaction = $stmt->fetch();

            if (!$transaction) {
                $this->pdo->rollBack();
                http_response_code(404);
                echo json_encode(['error' => 'Transaction not found']);
                return;
            }

            // Verify user owns this transaction
            if ($transaction['user_id'] != $userId) {
                $this->pdo->rollBack();
                http_response_code(403);
                echo json_encode(['error' => 'You can only delete your own transactions']);
                return;
            }

            $amount = floatval($transaction['amount']);
            $groupId = $transaction['group_id'];

            // Get the original split_between members to reverse the balance changes correctly
            $splitBetween = $transaction['split_between']
                ? json_decode($transaction['split_between'], true)
                : null;

            if ($splitBetween === null) {
                // Fallback for older transactions: assume split between all members
                $stmt = $this->pdo->prepare("SELECT id FROM users WHERE group_id = ?");
                $stmt->execute([$groupId]);
                $splitBetween = $stmt->fetchAll(PDO::FETCH_COLUMN);
            }

            $memberCount = count($splitBetween);

            if ($memberCount > 0) {
                $isDirectPayment = ($memberCount === 1 && !in_array($userId, $splitBetween));

                if ($isDirectPayment) {
                    // Reverse a direct payment
                    $selectedUserId = $splitBetween[0];

                    // Payer gets -amount (reversing the credit)
                    $stmt = $this->pdo->prepare("UPDATE balances SET balance = balance - ? WHERE group_id = ? AND user_id = ?");
                    $stmt->execute([$amount, $groupId, $userId]);

                    // Selected person gets +amount (reversing the debt)
                    $stmt = $this->pdo->prepare("UPDATE balances SET balance = balance + ? WHERE group_id = ? AND user_id = ?");
                    $stmt->execute([$amount, $groupId, $selectedUserId]);
                } else {
                    // Reverse a split payment
                    $share = $amount / $memberCount;

                    foreach ($splitBetween as $mid) {
                        if ($mid == $userId) {
                            // Reverse payer's credit: - (Amount - Share)
                            $change = -($amount - $share);
                        } else {
                            // Reverse others' debt: + Share
                            $change = $share;
                        }
                        $stmt = $this->pdo->prepare("UPDATE balances SET balance = balance + ? WHERE group_id = ? AND user_id = ?");
                        $stmt->execute([$change, $groupId, $mid]);
                    }
                }
            }

            // Delete the transaction
            $stmt = $this->pdo->prepare("DELETE FROM transactions WHERE id = ?");
            $stmt->execute([$transactionId]);

            $this->pdo->commit();
            echo json_encode(['message' => 'Transaction deleted successfully']);

        } catch (Exception $e) {
            $this->pdo->rollBack();
            http_response_code(500);
            echo json_encode(['error' => 'Failed to delete transaction: ' . $e->getMessage()]);
        }
    }
    
    
    public function recalculate() {
        $userId = $this->getUserIdFromToken();
        if (!$userId) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            return;
        }

        $user = $this->getUserGroup($userId);
        
        try {
            $this->pdo->beginTransaction();
            
            // 1. Reset all balances for this group to zero
            $stmt = $this->pdo->prepare("UPDATE balances SET balance = 0 WHERE group_id = ?");
            $stmt->execute([$user['group_id']]);
            
            // 2. Get all transactions for this group in chronological order
            $stmt = $this->pdo->prepare("
                SELECT * FROM transactions 
                WHERE group_id = ? 
                ORDER BY created_at ASC
            ");
            $stmt->execute([$user['group_id']]);
            $transactions = $stmt->fetchAll();
            
            // 3. Replay each transaction to rebuild balances
            foreach ($transactions as $transaction) {
                $amount = floatval($transaction['amount']);
                $payerId = $transaction['user_id'];
                
                // Get split_between data
                $splitBetween = $transaction['split_between'] 
                    ? json_decode($transaction['split_between'], true) 
                    : null;
                
                if ($splitBetween === null) {
                    // Get all members if not specified
                    $stmt = $this->pdo->prepare("SELECT id FROM users WHERE group_id = ?");
                    $stmt->execute([$user['group_id']]);
                    $splitBetween = $stmt->fetchAll(PDO::FETCH_COLUMN);
                }
                
                $memberCount = count($splitBetween);
                
                if ($memberCount > 0) {
                    // Check if only one person is selected and it's not the payer
                    $isDirectPayment = ($memberCount === 1 && !in_array($payerId, $splitBetween));
                    
                    if ($isDirectPayment) {
                        // Direct payment: selected person owes the full amount
                        $selectedUserId = $splitBetween[0];
                        
                        // Ensure balance rows exist
                        foreach ([$payerId, $selectedUserId] as $uid) {
                            $stmt = $this->pdo->prepare("SELECT id FROM balances WHERE group_id = ? AND user_id = ?");
                            $stmt->execute([$user['group_id'], $uid]);
                            if (!$stmt->fetch()) {
                                $stmt = $this->pdo->prepare("INSERT INTO balances (group_id, user_id, balance) VALUES (?, ?, 0)");
                                $stmt->execute([$user['group_id'], $uid]);
                            }
                        }
                        
                        // Payer gets +amount
                        $stmt = $this->pdo->prepare("UPDATE balances SET balance = balance + ? WHERE group_id = ? AND user_id = ?");
                        $stmt->execute([$amount, $user['group_id'], $payerId]);
                        
                        // Selected person gets -amount
                        $stmt = $this->pdo->prepare("UPDATE balances SET balance = balance - ? WHERE group_id = ? AND user_id = ?");
                        $stmt->execute([$amount, $user['group_id'], $selectedUserId]);
                        
                    } else {
                        // Split payment
                        $share = $amount / $memberCount;
                        
                        foreach ($splitBetween as $mid) {
                            // Ensure balance row exists
                            $stmt = $this->pdo->prepare("SELECT id FROM balances WHERE group_id = ? AND user_id = ?");
                            $stmt->execute([$user['group_id'], $mid]);
                            if (!$stmt->fetch()) {
                                $stmt = $this->pdo->prepare("INSERT INTO balances (group_id, user_id, balance) VALUES (?, ?, 0)");
                                $stmt->execute([$user['group_id'], $mid]);
                            }
                            
                            if ($mid == $payerId) {
                                // Payer: + (Amount - Share)
                                $change = $amount - $share;
                            } else {
                                // Others: - Share
                                $change = -$share;
                            }
                            
                            $stmt = $this->pdo->prepare("UPDATE balances SET balance = balance + ? WHERE group_id = ? AND user_id = ?");
                            $stmt->execute([$change, $user['group_id'], $mid]);
                        }
                    }
                }
            }
            
            $this->pdo->commit();
            echo json_encode([
                'message' => 'Balances recalculated successfully',
                'transactions_processed' => count($transactions)
            ]);
            
        } catch (Exception $e) {
            $this->pdo->rollBack();
            http_response_code(500);
            echo json_encode(['error' => 'Failed to recalculate balances: ' . $e->getMessage()]);
        }
    }
    
    private function getUserName($id) {
         $stmt = $this->pdo->prepare("SELECT name FROM users WHERE id = ?");
         $stmt->execute([$id]);
         return $stmt->fetchColumn();
    }
}
